export const PANEL_TEMPLATE = `
<div class="app">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M10.2 3.5h7.3a3 3 0 0 1 3 3v4.2a3 3 0 0 1-3 3h-1.1v3.1l-3.5-3.1h-2.7a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          <path d="M3.5 10.2v4.9a2.7 2.7 0 0 0 2.7 2.7h1v2.7l3.1-2.7h1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9.4 6.8 11.9 13m2.4-6.2L11.9 13M10.2 11.1h3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </span>
      <div class="brand-copy">
        <h1>Translator</h1>
        <p data-i18n-title="modelHint">OPENCODE</p>
      </div>
    </div>

    <label class="target-control" for="target-language">
      <span class="target-eyebrow" data-i18n="target"></span>
      <span class="target-select-wrap">
        <select class="target-select" id="target-language" data-i18n-aria-label="targetLanguage"></select>
        <span class="target-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none"><path d="m4.5 6.5 3.5 3 3.5-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </span>
    </label>
  </header>

  <div class="editor-card">
    <div class="card-top">
      <label class="field-title" for="source-input" data-i18n="source"></label>
      <div class="card-tools">
        <button class="auto-switch" id="auto-selection-toggle" type="button" role="switch" aria-checked="true" data-i18n-title="autoSelectionHint">
          <span data-i18n="autoSelection"></span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
        </button>
        <span class="char-count" id="char-count"></span>
      </div>
    </div>
    <textarea class="source-input" id="source-input" rows="8" spellcheck="false" maxlength="100000" dir="auto" data-i18n-placeholder="inputPlaceholder"></textarea>
    <div class="editor-footer">
      <div class="mini-actions">
        <button class="icon-button icon-button-small" id="paste" type="button" data-i18n-aria-label="paste" data-i18n-title="paste">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M9 4.5V3.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v.7H9Z" fill="currentColor"/></svg>
        </button>
        <button class="icon-button icon-button-small" id="clear" type="button" data-i18n-aria-label="clear" data-i18n-title="clear">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>
      <button class="primary-button" id="translate" type="button" disabled>
        <span class="button-spinner" aria-hidden="true"></span>
        <span id="translate-label"></span>
      </button>
    </div>
  </div>

  <article class="selection-card" id="selection-card" aria-live="polite" aria-labelledby="selection-title" hidden>
    <header class="selection-head">
      <div class="selection-heading">
        <span class="selection-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 8.5V6.8A1.8 1.8 0 0 1 6.8 5h1.7M15.5 5h1.7A1.8 1.8 0 0 1 19 6.8v1.7M19 15.5v1.7a1.8 1.8 0 0 1-1.8 1.8h-1.7M8.5 19H6.8A1.8 1.8 0 0 1 5 17.2v-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m9 9-2.4 6m2.1-2.2h3.4M14 12.2l1.8 2.8M18 12l-2.2 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </span>
        <span class="selection-title" id="selection-title" data-i18n="selection"></span>
        <span class="selection-meta" id="selection-meta"></span>
      </div>
      <div class="selection-actions">
        <button class="icon-button icon-button-small copy-button" id="selection-copy" type="button" hidden>
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="10" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 5.5h-8a2 2 0 0 0-2 2v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 12.5 4.1 4 8.9-9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-button icon-button-small" id="selection-close" type="button" data-i18n-aria-label="closeSelection" data-i18n-title="closeSelection">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        </button>
      </div>
    </header>
    <div class="selection-body">
      <div class="selection-loading" id="selection-loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <span id="selection-loading-text" data-i18n="translating"></span>
      </div>
      <p class="selection-output" id="selection-output" tabindex="0" dir="auto" hidden></p>
      <div class="selection-error" id="selection-error" hidden>
        <span id="selection-error-message"></span>
        <button class="text-button" id="selection-retry" type="button" data-i18n="retry"></button>
      </div>
    </div>
  </article>

  <div class="progress-card" id="progress" role="status" hidden>
    <div class="progress-line">
      <span class="spinner" aria-hidden="true"></span>
      <span class="progress-text" id="progress-text"></span>
      <button class="text-button progress-cancel" id="cancel" type="button" data-i18n="cancel"></button>
    </div>
    <div class="progress-track" aria-hidden="true"><span class="progress-bar" id="progress-bar"></span></div>
  </div>

  <div class="error-card" id="error" role="alert" hidden>
    <span class="error-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.8v4.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="16.2" r="1" fill="currentColor"/></svg>
    </span>
    <div class="error-copy">
      <p id="error-message"></p>
      <div class="error-actions">
        <button class="text-button" id="error-retry" type="button" data-i18n="retry"></button>
      </div>
    </div>
  </div>

  <div class="result-area" id="result-area" hidden aria-live="polite">
    <div class="result-toolbar">
      <div class="display-switch" role="group" data-i18n-aria-label="displayMode">
        <button class="display-option is-active" data-display="bilingual" type="button" aria-pressed="true" data-i18n="bilingual"></button>
        <button class="display-option" data-display="translation" type="button" aria-pressed="false" data-i18n="translation"></button>
        <button class="display-option" data-display="source" type="button" aria-pressed="false" data-i18n="source"></button>
      </div>
      <div class="result-tools">
        <span class="result-meta" id="result-meta"></span>
        <button class="icon-button icon-button-small collapse-button" id="collapse" type="button" aria-expanded="true" aria-controls="result">
          <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 14 6-6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-button icon-button-small copy-button" id="copy" type="button">
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="10" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 5.5h-8a2 2 0 0 0-2 2v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 12.5 4.1 4 8.9-9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    <div class="result" id="result" tabindex="0" data-i18n-aria-label="resultContent"></div>
  </div>

  <p class="privacy-note">
    <span class="privacy-dot" aria-hidden="true"></span>
    <span data-i18n="privacy"></span>
  </p>
</div>
`;
