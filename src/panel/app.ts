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
import { describeError, formatError, formatCount, formatDuration, isMessageKey, isUiLanguage, message, resolveUiLocale, type ErrorMessage, type MessageKey } from './i18n';

interface ResultState {
  outcome: TranslationOutcome;
}

interface ActiveRun {
  controller: AbortController;
  cancelling: boolean;
}

type DisplayError = ErrorMessage;

type SelectionPhase = 'loading' | 'ready' | 'error' | 'notice';

interface SelectionView {
  phase: SelectionPhase;
  source: string;
  charCount: number;
  translation?: string;
  error?: DisplayError;
  elapsedMs?: number;
}

const MAX_SELECTION_TRANSLATION_CHARS = 2_000;
const SELECTION_DEBOUNCE_MS = 450;

export interface AppHandle {
  updateHostLocale(locale: string): void;
  dispose(): void;
}

export interface MountAppOptions {
  host: Pick<HostClient, 'storage' | 'generate' | 'toast' | 'writeClipboard'>;
  root: HTMLElement;
  ready: Pick<HostReadyContext, 'locale'>;
  preferences?: Preferences;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

export async function mountApp(options: MountAppOptions): Promise<AppHandle> {
  const { host, root } = options;
  const preferences = options.preferences ?? await loadPreferences(host, options.ready.locale);
  let hostLocale = options.ready.locale;
  let locale = resolveUiLocale(preferences.uiLanguage, hostLocale);
  const t = (key: MessageKey, params?: Record<string, number | string>) => message(locale, key, params);
  const translateWithModel = createOpenCodeTranslator({ host });

  root.innerHTML = PANEL_TEMPLATE;

  const ui = {
    uiLanguage: byId<HTMLSelectElement>('ui-language'),
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
  const copyTimers = new Map<HTMLButtonElement, number>();
  let progress: { completed: number; total: number } | null = null;
  let disposed = false;

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
      .catch(() => showToast('error', t('saveFailed'), true));
  }

  function showToast(kind: 'info' | 'success' | 'error', message: string, dismiss = false): void {
    if (disposed) return;
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
    const label = t(collapsed ? 'expand' : 'collapse');
    ui.collapse.setAttribute('aria-label', label);
    ui.collapse.title = label;
  }

  function syncResultLabels(): void {
    ui.resultMeta.textContent = result
      ? `${formatCount(locale, result.outcome.paragraphs.length, 'paragraphs')} · ${formatDuration(locale, result.outcome.elapsedMs)}`
      : '';
    syncResultCollapse();
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
    syncResultLabels();
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

  function syncSelectionLabels(): void {
    const view = selectionView;
    ui.selectionMeta.textContent = view
      ? `${formatCount(locale, view.charCount, 'characters')}${view.phase === 'ready' ? ` · ${formatDuration(locale, view.elapsedMs ?? 0)}` : ''}`
      : '';
    ui.selectionErrorMessage.textContent = view?.error ? formatError(locale, view.error) : t('failed');
  }

  function renderSelection(): void {
    syncSelectionLabels();
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
    ui.selectionError.classList.remove('is-notice');

    if (view.phase === 'loading') {
      ui.selectionLoading.hidden = false;
      ui.selectionOutput.hidden = true;
      ui.selectionError.hidden = true;
      ui.selectionCopy.hidden = true;
      return;
    }

    if (view.phase === 'ready') {
      ui.selectionLoading.hidden = true;
      ui.selectionOutput.textContent = view.translation ?? '';
      ui.selectionOutput.hidden = false;
      ui.selectionOutput.scrollTop = 0;
      ui.selectionError.hidden = true;
      ui.selectionCopy.hidden = false;
      return;
    }

    ui.selectionLoading.hidden = true;
    ui.selectionOutput.hidden = true;
    ui.selectionError.hidden = false;
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

    ui.errorMessage.textContent = formatError(locale, error);
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
    ui.charCount.textContent = formatCount(locale, length, 'characters');
    const over = length > MAX_TRANSLATION_CHARS;
    ui.charCount.classList.toggle('over-limit', over);
    ui.charCount.title = over ? t('maxChars', { limit: MAX_TRANSLATION_CHARS }) : '';
    ui.charCount.setAttribute(
      'aria-label',
      over
        ? t('overLimit', { count: formatCount(locale, length, 'characters'), limit: MAX_TRANSLATION_CHARS })
        : formatCount(locale, length, 'characters'),
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
    ui.translateLabel.textContent = t(busy ? 'translating' : 'translate');
    ui.translate.title = overLimit
      ? t('maxChars', { limit: MAX_TRANSLATION_CHARS })
      : t('translateHint');
    ui.cancel.disabled = activeRun?.cancelling ?? true;
  }

  function showProgress(completed = 0, total = 0): void {
    progress = { completed, total };
    syncProgress();
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    ui.progressBar.style.width = `${percent}%`;
  }

  function syncProgress(): void {
    if (!progress) return;
    ui.progress.hidden = false;
    ui.progressText.textContent =
      activeRun?.cancelling ? t('cancelling')
        : progress.total > 0 ? t('progress', progress) : t('preparing');
  }

  function hideProgress(): void {
    progress = null;
    ui.progress.hidden = true;
    ui.progressBar.style.width = '0%';
    ui.progressText.textContent = t('preparing');
  }

  function syncCopyLabel(button: HTMLButtonElement): void {
    const key = button.classList.contains('is-copied') ? 'copied' : button === ui.selectionCopy ? 'copySelection' : 'copy';
    button.setAttribute('aria-label', t(key));
    button.title = t(key);
  }

  function copyButtonFeedback(button: HTMLButtonElement): void {
    const previous = copyTimers.get(button);
    if (previous) window.clearTimeout(previous);

    button.classList.add('is-copied');
    syncCopyLabel(button);
    copyTimers.set(
      button,
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        syncCopyLabel(button);
        copyTimers.delete(button);
      }, 1200),
    );
  }

  async function copyText(
    text: string,
    button: HTMLButtonElement,
    tooLongMessage: MessageKey,
  ): Promise<void> {
    if (!text.trim()) return;
    if (text.length > 32_000) {
      showToast('error', t(tooLongMessage, { limit: 32_000 }), true);
      return;
    }

    try {
      await host.writeClipboard(text);
      if (!disposed) copyButtonFeedback(button);
    } catch {
      showToast('error', t('copyFailed'), true);
    }
  }

  async function copyTranslation(): Promise<void> {
    const text =
      result?.outcome.paragraphs.map((paragraph) => paragraph.translation).join('\n\n') ?? '';
    await copyText(text, ui.copy, 'copyTooLong');
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
            throw new TranslationError('Empty translation', 'invalid-response', 'empty-response');
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
            error: describeError(caught),
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
          error: { key: 'selectionTooLong', limit: MAX_SELECTION_TRANSLATION_CHARS },
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
        key: 'textTooLong', limit: MAX_TRANSLATION_CHARS,
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
      if (plan.segments.length === 0) {
        error = { key: 'noText' };
        renderError();
        return;
      }
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
        error = describeError(caught);
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
    syncProgress();
    syncControls();
  }

  async function readClipboard(): Promise<void> {
    if (activeRun) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showToast('info', t('clipboardEmpty'), true);
        return;
      }
      if (disposed) return;
      ui.sourceInput.value = text;
      ui.sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
      ui.sourceInput.focus();
      ui.sourceInput.setSelectionRange(0, 0);
      showToast('success', t('clipboardRead'));
    } catch {
      ui.sourceInput.focus();
      showToast('info', t('pasteManually'), true);
    }
  }

  function applyLocale(): void {
    locale = resolveUiLocale(preferences.uiLanguage, hostLocale);
    document.documentElement.lang = locale;
    ui.uiLanguage.value = preferences.uiLanguage;
    for (const [data, attribute] of [
      ['data-i18n', null], ['data-i18n-title', 'title'],
      ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label'],
    ] as const) {
      for (const node of root.querySelectorAll<HTMLElement>(`[${data}]`)) {
        const key = node.getAttribute(data)!;
        if (!isMessageKey(key)) throw new Error(`Unknown UI message: ${key}`);
        if (attribute) node.setAttribute(attribute, t(key));
        else node.textContent = t(key);
      }
    }
    syncCharCount();
    syncControls();
    syncResultLabels();
    syncSelectionLabels();
    syncProgress();
    renderError();
    syncCopyLabel(ui.copy);
    syncCopyLabel(ui.selectionCopy);
  }

  ui.uiLanguage.addEventListener('change', () => {
    if (!isUiLanguage(ui.uiLanguage.value)) return;
    preferences.uiLanguage = ui.uiLanguage.value;
    applyLocale();
    persist();
  });

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
      'selectionCopyTooLong',
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

  applyLocale();
  syncCharCount();
  syncControls();
  syncDisplayState();
  syncAutoSelection();
  renderResult();
  renderError();
  renderSelection();

  return {
    updateHostLocale(nextLocale) {
      if (disposed) return;
      hostLocale = nextLocale;
      applyLocale();
    },
    dispose() {
      disposed = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.clearTimeout(selectionTimer);
      selectionGeneration += 1;
      selectionQueue = null;
      for (const timer of copyTimers.values()) window.clearTimeout(timer);
      copyTimers.clear();
      activeRun?.controller.abort();
    },
  };
}
