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

type SelectionPhase = 'loading' | 'ready' | 'error' | 'notice';

interface SelectionView {
  phase: SelectionPhase;
  source: string;
  charCount: number;
  translation?: string;
  error?: string;
  elapsedMs?: number;
}

const MAX_SELECTION_TRANSLATION_CHARS = 2_000;
const SELECTION_DEBOUNCE_MS = 450;

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
  return `${Math.max(0.1, milliseconds / 1000).toFixed(1)} 秒`;
}

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof TranslationError || error instanceof RangeError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return '翻译没有完成，请重试。';
}

export async function mountApp(options: MountAppOptions): Promise<AppHandle> {
  const { host, root } = options;
  const preferences: Preferences = await loadPreferences(host, options.ready.locale);
  const translateWithModel = createOpenCodeTranslator({ host });

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
    selectionCard: byId('selection-card'),
    selectionMeta: byId('selection-meta'),
    selectionLoading: byId('selection-loading'),
    selectionOutput: byId<HTMLParagraphElement>('selection-output'),
    selectionError: byId('selection-error'),
    selectionErrorMessage: byId('selection-error-message'),
    selectionRetry: byId<HTMLButtonElement>('selection-retry'),
    selectionCopy: byId<HTMLButtonElement>('selection-copy'),
    selectionClose: byId<HTMLButtonElement>('selection-close'),
    resultArea: byId('result-area'),
    result: byId('result'),
    resultMeta: byId('result-meta'),
    collapse: byId<HTMLButtonElement>('collapse'),
    copy: byId<HTMLButtonElement>('copy'),
    autoSelectionToggle: byId<HTMLButtonElement>('auto-selection-toggle'),
    displayButtons: [
      ...document.querySelectorAll<HTMLButtonElement>('[data-display]'),
    ],
  };

  let activeRun: ActiveRun | null = null;
  let result: ResultState | null = null;
  let error: DisplayError | null = null;
  let resultCollapsed = false;
  let saveQueue: Promise<void> = Promise.resolve();
  const copyTimers = new WeakMap<HTMLButtonElement, number>();

  let selectionView: SelectionView | null = null;
  let selectionTimer = 0;
  let selectionQueue: string | null = null;
  let selectionBusy = false;
  let selectionGeneration = 0;
  let lastTriggeredSelection = '';

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

  function syncAutoSelection(): void {
    ui.autoSelectionToggle.setAttribute('aria-checked', String(preferences.autoSelection));
  }

  function syncResultCollapse(): void {
    const collapsed = Boolean(result) && resultCollapsed;
    ui.result.hidden = collapsed;
    ui.resultArea.classList.toggle('is-collapsed', collapsed);
    ui.collapse.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? '展开译文' : '收起译文';
    ui.collapse.setAttribute('aria-label', label);
    ui.collapse.title = label;
  }

  function renderResult(): void {
    syncDisplayState();
    if (!result) {
      resultCollapsed = false;
      ui.resultArea.hidden = true;
      ui.resultMeta.textContent = '';
      ui.result.replaceChildren();
      syncResultCollapse();
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
    syncResultCollapse();
  }

  function renderSelection(): void {
    const view = selectionView;
    if (!view) {
      ui.selectionCard.hidden = true;
      ui.selectionMeta.textContent = '';
      ui.selectionLoading.hidden = true;
      ui.selectionOutput.hidden = true;
      ui.selectionOutput.textContent = '';
      ui.selectionError.hidden = true;
      ui.selectionErrorMessage.textContent = '';
      ui.selectionCopy.hidden = true;
      return;
    }

    ui.selectionCard.hidden = false;
    const charLabel = `${formatNumber(view.charCount)} 字`;
    ui.selectionError.classList.remove('is-notice');

    if (view.phase === 'loading') {
      ui.selectionMeta.textContent = charLabel;
      ui.selectionLoading.hidden = false;
      ui.selectionOutput.hidden = true;
      ui.selectionError.hidden = true;
      ui.selectionCopy.hidden = true;
      return;
    }

    if (view.phase === 'ready') {
      ui.selectionMeta.textContent = `${charLabel} · ${formatDuration(view.elapsedMs ?? 0)}`;
      ui.selectionLoading.hidden = true;
      ui.selectionOutput.textContent = view.translation ?? '';
      ui.selectionOutput.hidden = false;
      ui.selectionOutput.scrollTop = 0;
      ui.selectionError.hidden = true;
      ui.selectionCopy.hidden = false;
      return;
    }

    ui.selectionMeta.textContent = charLabel;
    ui.selectionLoading.hidden = true;
    ui.selectionOutput.hidden = true;
    ui.selectionError.hidden = false;
    ui.selectionErrorMessage.textContent = view.error ?? '翻译失败，请重试。';
    ui.selectionRetry.hidden = view.phase !== 'error';
    ui.selectionError.classList.toggle('is-notice', view.phase === 'notice');
    ui.selectionCopy.hidden = true;
  }

  function renderError(): void {
    if (!error) {
      ui.error.hidden = true;
      ui.errorMessage.textContent = '';
      return;
    }

    ui.errorMessage.textContent = error.message;
    ui.error.hidden = false;
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
    ui.charCount.title = over ? `最多 ${formatNumber(MAX_TRANSLATION_CHARS)} 字` : '';
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
    ui.translateLabel.textContent = busy ? '翻译中…' : '翻译全文';
    ui.translate.title = overLimit
      ? `最多 ${formatNumber(MAX_TRANSLATION_CHARS)} 字`
      : '翻译全文（Ctrl/Cmd + Enter）';
    ui.cancel.disabled = activeRun?.cancelling ?? true;
  }

  function showProgress(completed = 0, total = 0): void {
    ui.progress.hidden = false;
    ui.progressText.textContent =
      total > 0 ? `正在翻译 ${completed}/${total}` : '准备翻译…';
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    ui.progressBar.style.width = `${percent}%`;
  }

  function hideProgress(): void {
    ui.progress.hidden = true;
    ui.progressBar.style.width = '0%';
    ui.progressText.textContent = '准备翻译…';
  }

  function copyButtonFeedback(button: HTMLButtonElement): void {
    const previous = copyTimers.get(button);
    if (previous) window.clearTimeout(previous);

    const defaultLabel = button.dataset.label || '复制译文';
    button.classList.add('is-copied');
    button.setAttribute('aria-label', '已复制');
    button.title = '已复制';
    copyTimers.set(
      button,
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.setAttribute('aria-label', defaultLabel);
        button.title = defaultLabel;
        copyTimers.delete(button);
      }, 1200),
    );
  }

  async function copyText(
    text: string,
    button: HTMLButtonElement,
    tooLongMessage: string,
  ): Promise<void> {
    if (!text.trim()) return;
    if (text.length > 32_000) {
      showToast('error', tooLongMessage, true);
      return;
    }

    try {
      await host.writeClipboard(text);
      copyButtonFeedback(button);
    } catch {
      showToast('error', '复制失败，请手动复制。', true);
    }
  }

  async function copyTranslation(): Promise<void> {
    const text =
      result?.outcome.paragraphs.map((paragraph) => paragraph.translation).join('\n\n') ?? '';
    await copyText(text, ui.copy, '超过 32,000 字，请分段复制。');
  }

  function showSelectionLoading(source: string): void {
    selectionView = { phase: 'loading', source, charCount: source.length };
    renderSelection();
  }

  async function drainSelectionQueue(): Promise<void> {
    if (selectionBusy) return;
    selectionBusy = true;

    try {
      while (selectionQueue) {
        const text = selectionQueue;
        selectionQueue = null;
        const generation = selectionGeneration;
        showSelectionLoading(text);
        const startedAt = Date.now();

        try {
          const response = await translateWithModel({
            segments: [text],
            target: getTargetLanguage(preferences.targetLanguage),
            signal: new AbortController().signal,
          });
          if (generation !== selectionGeneration || selectionQueue) continue;
          if (!selectionView || selectionView.source !== text) continue;

          const translation = response.translations[0]?.trim();
          if (!translation) {
            throw new TranslationError('模型返回了空译文，请重试。', 'invalid-response');
          }
          selectionView = {
            phase: 'ready',
            source: text,
            charCount: text.length,
            translation,
            elapsedMs: Date.now() - startedAt,
          };
          renderSelection();
        } catch (caught) {
          if (generation !== selectionGeneration || selectionQueue) continue;
          if (!selectionView || selectionView.source !== text) continue;
          selectionView = {
            phase: 'error',
            source: text,
            charCount: text.length,
            error: friendlyErrorMessage(caught),
          };
          renderSelection();
        }
      }
    } finally {
      selectionBusy = false;
      if (selectionQueue) void drainSelectionQueue();
    }
  }

  function enqueueSelectionTranslation(text: string): void {
    selectionGeneration += 1;
    selectionQueue = text;
    showSelectionLoading(text);
    if (!selectionBusy) void drainSelectionQueue();
  }

  function closeSelectionCard(): void {
    window.clearTimeout(selectionTimer);
    selectionTimer = 0;
    lastTriggeredSelection = '';
    selectionGeneration += 1;
    selectionQueue = null;
    selectionView = null;
    renderSelection();
  }

  function currentSelectedText(): string {
    const start = ui.sourceInput.selectionStart ?? 0;
    const end = ui.sourceInput.selectionEnd ?? 0;
    return end > start ? ui.sourceInput.value.slice(start, end).trim() : '';
  }

  function handleSelectionChange(): void {
    if (activeRun) return;

    if (!preferences.autoSelection) return;

    const selected = currentSelectedText();
    if (!selected) {
      lastTriggeredSelection = '';
      window.clearTimeout(selectionTimer);
      selectionTimer = 0;
      return;
    }
    if (selected === lastTriggeredSelection) return;

    lastTriggeredSelection = selected;
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      selectionTimer = 0;
      if (activeRun) return;
      if (selected.length > MAX_SELECTION_TRANSLATION_CHARS) {
        selectionGeneration += 1;
        selectionQueue = null;
        selectionView = {
          phase: 'notice',
          source: selected,
          charCount: selected.length,
          error: `选区超过 ${formatNumber(MAX_SELECTION_TRANSLATION_CHARS)} 字，请改用全文翻译。`,
        };
        renderSelection();
        return;
      }
      enqueueSelectionTranslation(selected);
    }, SELECTION_DEBOUNCE_MS);
  }

  async function startTranslation(): Promise<void> {
    if (activeRun) return;

    const sourceText = ui.sourceInput.value.trim();
    if (!sourceText) return;
    if (sourceText.length > MAX_TRANSLATION_CHARS) {
      error = {
        message: `最多 ${formatNumber(MAX_TRANSLATION_CHARS)} 字，请缩短后重试。`,
      };
      renderError();
      return;
    }

    window.clearTimeout(selectionTimer);
    selectionTimer = 0;

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
      const outcome = await runTranslation(plan, {
        translate: translateWithModel,
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
        error = { message: friendlyErrorMessage(caught) };
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
        showToast('info', '剪贴板为空。', true);
        return;
      }
      ui.sourceInput.value = text;
      ui.sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
      ui.sourceInput.focus();
      ui.sourceInput.setSelectionRange(0, 0);
      showToast('success', '已读取剪贴板。');
    } catch {
      ui.sourceInput.focus();
      showToast('info', '请使用 Ctrl/Cmd + V 粘贴。', true);
    }
  }

  ui.targetLanguage.addEventListener('change', () => {
    if (!isTargetLanguageCode(ui.targetLanguage.value)) return;
    preferences.targetLanguage = ui.targetLanguage.value;
    persist();
  });

  ui.autoSelectionToggle.addEventListener('click', () => {
    preferences.autoSelection = !preferences.autoSelection;
    syncAutoSelection();
    persist();
    if (!preferences.autoSelection) closeSelectionCard();
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
    if (!activeRun) {
      closeSelectionCard();
      resetOutcome();
    }
  });

  for (const eventName of ['select', 'pointerup', 'keyup'] as const) {
    ui.sourceInput.addEventListener(eventName, handleSelectionChange);
  }

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

  ui.collapse.addEventListener('click', () => {
    if (!result) return;
    resultCollapsed = !resultCollapsed;
    syncResultCollapse();
  });

  ui.selectionClose.addEventListener('click', closeSelectionCard);
  ui.selectionRetry.addEventListener('click', () => {
    if (selectionView?.phase !== 'error') return;
    enqueueSelectionTranslation(selectionView.source);
  });
  ui.selectionCopy.addEventListener('click', () => {
    if (selectionView?.phase !== 'ready' || !selectionView.translation) return;
    void copyText(
      selectionView.translation,
      ui.selectionCopy,
      '超过 32,000 字，请减小选区。',
    );
  });

  ui.clear.addEventListener('click', () => {
    if (activeRun) return;
    ui.sourceInput.value = '';
    ui.sourceInput.focus();
    closeSelectionCard();
    syncCharCount();
    syncControls();
    resetOutcome();
  });

  const onBeforeUnload = () => {
    window.clearTimeout(selectionTimer);
    activeRun?.controller.abort();
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  syncCharCount();
  syncControls();
  syncDisplayState();
  syncAutoSelection();
  renderResult();
  renderError();
  renderSelection();

  return {
    dispose() {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(selectionTimer);
      selectionGeneration += 1;
      activeRun?.controller.abort();
    },
  };
}
