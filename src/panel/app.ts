import type { HostClient, HostReadyContext } from '@openchamber/sdk';
import { TranslationError, isCancellation } from '../translation/errors';
import {
  TARGET_LANGUAGES,
  getTargetLanguage,
  isTargetLanguageCode,
} from '../translation/languages';
import {
  MAX_TRANSLATION_CHARS,
  createTranslationPlan,
  runTranslation,
  type TranslationOutcome,
} from '../translation/plan';
import {
  OPENCODE_LIMITS,
  createOpenCodeTranslator,
} from '../translation/providers/opencode';
import type { DisplayMode } from '../translation/types';
import {
  loadPreferences,
  savePreferences,
  type Preferences,
} from './preferences';
import { PANEL_TEMPLATE } from './template';

interface ResultState {
  outcome: TranslationOutcome;
}

interface ActiveRun {
  controller: AbortController;
  cancelling: boolean;
}

interface DisplayError {
  message: string;
}

export interface AppHandle {
  dispose(): void;
}

export interface MountAppOptions {
  host: HostClient;
  root: HTMLElement;
  ready: HostReadyContext;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} 毫秒`;
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
}

export async function mountApp(options: MountAppOptions): Promise<AppHandle> {
  const { host, root } = options;
  const preferences: Preferences = await loadPreferences(host, options.ready.locale);

  root.innerHTML = PANEL_TEMPLATE;

  const ui = {
    targetLanguage: byId<HTMLSelectElement>('target-language'),
    sourceInput: byId<HTMLTextAreaElement>('source-input'),
    charCount: byId('char-count'),
    paste: byId<HTMLButtonElement>('paste'),
    clear: byId<HTMLButtonElement>('clear'),
    translate: byId<HTMLButtonElement>('translate'),
    translateLabel: byId('translate-label'),
    progress: byId('progress'),
    progressText: byId('progress-text'),
    progressBar: byId('progress-bar'),
    cancel: byId<HTMLButtonElement>('cancel'),
    error: byId('error'),
    errorMessage: byId('error-message'),
    errorRetry: byId<HTMLButtonElement>('error-retry'),
    resultArea: byId('result-area'),
    result: byId('result'),
    resultMeta: byId('result-meta'),
    copy: byId<HTMLButtonElement>('copy'),
    empty: byId('empty'),
    displayButtons: [
      ...document.querySelectorAll<HTMLButtonElement>('[data-display]'),
    ],
  };

  let activeRun: ActiveRun | null = null;
  let result: ResultState | null = null;
  let error: DisplayError | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let copyTimer = 0;

  for (const language of TARGET_LANGUAGES) {
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = language.label;
    ui.targetLanguage.append(option);
  }
  ui.targetLanguage.value = preferences.targetLanguage;

  function persist(): void {
    const snapshot: Preferences = { ...preferences };
    saveQueue = saveQueue
      .then(() => savePreferences(host, snapshot))
      .catch(() => undefined);
  }

  function showToast(kind: 'info' | 'success' | 'error', message: string, dismiss = false): void {
    void host.toast({ kind, message, dismiss }).catch(() => undefined);
  }

  function syncDisplayState(): void {
    for (const button of ui.displayButtons) {
      const active = button.dataset.display === preferences.displayMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function refreshEmptyVisibility(): void {
    ui.empty.hidden = Boolean(result || error || activeRun);
  }

  function renderResult(): void {
    syncDisplayState();
    if (!result) {
      ui.resultArea.hidden = true;
      ui.resultMeta.textContent = '';
      ui.result.replaceChildren();
      refreshEmptyVisibility();
      return;
    }

    const { outcome } = result;
    ui.resultMeta.textContent = `${outcome.paragraphs.length} 段 · ${formatDuration(outcome.elapsedMs)}`;
    ui.result.className = `result mode-${preferences.displayMode}`;
    const fragment = document.createDocumentFragment();

    for (const paragraph of outcome.paragraphs) {
      const pair = document.createElement('div');
      pair.className = 'paragraph-pair';

      if (preferences.displayMode !== 'translation') {
        const source = document.createElement('p');
        source.className = 'paragraph-source';
        source.textContent = paragraph.source;
        pair.append(source);
      }
      if (preferences.displayMode !== 'source') {
        const translation = document.createElement('p');
        translation.className = 'paragraph-translation';
        translation.textContent = paragraph.translation;
        pair.append(translation);
      }

      fragment.append(pair);
    }

    ui.result.replaceChildren(fragment);
    ui.resultArea.hidden = false;
    refreshEmptyVisibility();
  }

  function renderError(): void {
    if (!error) {
      ui.error.hidden = true;
      ui.errorMessage.textContent = '';
      refreshEmptyVisibility();
      return;
    }

    ui.errorMessage.textContent = error.message;
    ui.error.hidden = false;
    refreshEmptyVisibility();
  }

  function resetOutcome(): void {
    result = null;
    error = null;
    renderResult();
    renderError();
  }

  function syncCharCount(): void {
    const length = ui.sourceInput.value.length;
    ui.charCount.textContent = `${formatNumber(length)} 字`;
    const over = length > MAX_TRANSLATION_CHARS;
    ui.charCount.classList.toggle('over-limit', over);
    ui.charCount.title = over
      ? `单次最多翻译 ${formatNumber(MAX_TRANSLATION_CHARS)} 字`
      : '';
    ui.charCount.setAttribute(
      'aria-label',
      over
        ? `${formatNumber(length)} 字，超过单次上限 ${formatNumber(MAX_TRANSLATION_CHARS)} 字`
        : `${formatNumber(length)} 字`,
    );
  }

  function syncControls(): void {
    const busy = Boolean(activeRun);
    const hasText = Boolean(ui.sourceInput.value.trim());
    const overLimit = ui.sourceInput.value.length > MAX_TRANSLATION_CHARS;

    ui.targetLanguage.disabled = busy;
    ui.sourceInput.readOnly = busy;
    ui.paste.disabled = busy;
    ui.clear.disabled = busy || !ui.sourceInput.value;
    ui.translate.disabled = busy || !hasText || overLimit;
    ui.translate.classList.toggle('is-loading', busy);
    ui.translate.setAttribute('aria-busy', String(busy));
    ui.translateLabel.textContent = busy ? '翻译中…' : '全文翻译';
    ui.translate.title = overLimit
      ? `单次最多翻译 ${formatNumber(MAX_TRANSLATION_CHARS)} 字`
      : '全文翻译（Ctrl/Cmd + Enter）';
    ui.cancel.disabled = activeRun?.cancelling ?? true;
  }

  function showProgress(completed = 0, total = 0): void {
    ui.progress.hidden = false;
    ui.progressText.textContent =
      total > 0
        ? `OpenCode 正在翻译 · ${completed}/${total} 段`
        : '正在准备翻译…';
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    ui.progressBar.style.width = `${percent}%`;
    refreshEmptyVisibility();
  }

  function hideProgress(): void {
    ui.progress.hidden = true;
    ui.progressBar.style.width = '0%';
    ui.progressText.textContent = '正在翻译…';
    refreshEmptyVisibility();
  }

  function copyButtonFeedback(): void {
    window.clearTimeout(copyTimer);
    ui.copy.classList.add('is-copied');
    ui.copy.setAttribute('aria-label', '已复制');
    ui.copy.title = '已复制';
    copyTimer = window.setTimeout(() => {
      ui.copy.classList.remove('is-copied');
      ui.copy.setAttribute('aria-label', '复制译文');
      ui.copy.title = '复制译文';
    }, 1200);
  }

  async function copyTranslation(): Promise<void> {
    const text =
      result?.outcome.paragraphs.map((paragraph) => paragraph.translation).join('\n\n') ?? '';
    if (!text.trim()) return;
    if (text.length > 32_000) {
      showToast('error', '结果超过 32,000 字，请分段复制。', true);
      return;
    }

    try {
      await host.writeClipboard(text);
      copyButtonFeedback();
    } catch {
      showToast('error', '复制失败，请手动选择译文复制。', true);
    }
  }

  async function startTranslation(): Promise<void> {
    if (activeRun) return;

    const sourceText = ui.sourceInput.value.trim();
    if (!sourceText) return;
    if (sourceText.length > MAX_TRANSLATION_CHARS) {
      error = {
        message: `单次最多翻译 ${formatNumber(MAX_TRANSLATION_CHARS)} 字，请缩短内容后重试。`,
      };
      renderError();
      return;
    }

    const controller = new AbortController();
    const run: ActiveRun = { controller, cancelling: false };
    activeRun = run;
    result = null;
    error = null;
    renderResult();
    renderError();
    showProgress();
    syncControls();

    try {
      const plan = createTranslationPlan(sourceText, OPENCODE_LIMITS);
      if (plan.segments.length === 0) throw new Error('没有可翻译的文本。');
      const translate = createOpenCodeTranslator({ host });
      const outcome = await runTranslation(plan, {
        translate,
        limits: OPENCODE_LIMITS,
        target: getTargetLanguage(preferences.targetLanguage),
        signal: controller.signal,
        onProgress: ({ completed, total }) => {
          if (activeRun === run) showProgress(completed, total);
        },
      });

      result = { outcome };
      renderResult();
    } catch (caught) {
      if (!isCancellation(caught)) {
        if (caught instanceof TranslationError || caught instanceof RangeError) {
          error = { message: caught.message };
        } else {
          error = {
            message:
              caught instanceof Error && caught.message.trim()
                ? caught.message
                : '翻译没有完成，请重试。',
          };
        }
        renderError();
      }
    } finally {
      if (activeRun === run) activeRun = null;
      hideProgress();
      syncControls();
    }
  }

  function cancelTranslation(): void {
    if (!activeRun || activeRun.cancelling) return;
    activeRun.cancelling = true;
    activeRun.controller.abort();
    ui.progressText.textContent = '正在取消…';
    syncControls();
  }

  async function readClipboard(): Promise<void> {
    if (activeRun) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showToast('info', '剪贴板里没有可翻译的文字。', true);
        return;
      }
      ui.sourceInput.value = text;
      ui.sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
      ui.sourceInput.focus();
      ui.sourceInput.setSelectionRange(0, 0);
      showToast('success', '已从剪贴板读取文字。');
    } catch {
      ui.sourceInput.focus();
      showToast('info', '无法读取剪贴板，请按 Ctrl/Cmd + V 粘贴。', true);
    }
  }

  ui.targetLanguage.addEventListener('change', () => {
    if (!isTargetLanguageCode(ui.targetLanguage.value)) return;
    preferences.targetLanguage = ui.targetLanguage.value;
    persist();
  });

  ui.displayButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const display = button.dataset.display;
      if (display !== 'bilingual' && display !== 'translation' && display !== 'source') {
        return;
      }
      preferences.displayMode = display as DisplayMode;
      syncDisplayState();
      renderResult();
      persist();
    });
  });

  ui.sourceInput.addEventListener('input', () => {
    syncCharCount();
    syncControls();
    if (!activeRun) resetOutcome();
  });

  ui.sourceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void startTranslation();
    }
  });

  ui.translate.addEventListener('click', () => void startTranslation());
  ui.cancel.addEventListener('click', cancelTranslation);
  ui.errorRetry.addEventListener('click', () => void startTranslation());
  ui.paste.addEventListener('click', () => void readClipboard());
  ui.copy.addEventListener('click', () => void copyTranslation());

  ui.clear.addEventListener('click', () => {
    if (activeRun) return;
    ui.sourceInput.value = '';
    ui.sourceInput.focus();
    syncCharCount();
    syncControls();
    resetOutcome();
  });

  const onBeforeUnload = () => activeRun?.controller.abort();
  window.addEventListener('beforeunload', onBeforeUnload);

  syncCharCount();
  syncControls();
  syncDisplayState();
  renderResult();
  renderError();

  return {
    dispose() {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(copyTimer);
      activeRun?.controller.abort();
    },
  };
}
