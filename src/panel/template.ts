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
        <h1>全文翻译</h1>
        <p>OpenCode · Small Model</p>
      </div>
    </div>
  </header>

  <div class="model-deck">
    <div class="model-source">
      <span class="model-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m12 2.8 1.7 5.2L19 10l-5.3 1.9L12 17.3l-1.7-5.4L5 10l5.3-2 1.7-5.2Z" fill="currentColor"/><path d="m18.2 15.5.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" fill="currentColor" opacity=".55"/></svg>
      </span>
      <div class="model-copy">
        <strong>OpenCode 模型</strong>
        <span>沿用 OpenChamber 配置</span>
      </div>
      <span class="model-tag">免 Key</span>
    </div>

    <label class="target-control" for="target-language">
      <span class="target-eyebrow">译为</span>
      <span class="target-select-wrap">
        <select class="target-select" id="target-language" aria-label="目标语言"></select>
        <span class="target-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none"><path d="m4.5 6.5 3.5 3 3.5-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </span>
    </label>
  </div>

  <p class="model-note">
    <span class="model-note-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M12 10.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.7" r="1" fill="currentColor"/></svg>
    </span>
    <span>需要 DeepSeek？在 <strong>设置 → 会话 → Small Model</strong> 选择已配置的模型，无需在此填写 API Key。</span>
  </p>

  <div class="editor-card">
    <div class="card-top">
      <label class="field-title" for="source-input">原文</label>
      <span class="char-count" id="char-count">0 字</span>
    </div>
    <textarea class="source-input" id="source-input" rows="8" spellcheck="false" maxlength="100000" placeholder="粘贴文章或 Markdown，按段落生成对照译文…"></textarea>
    <div class="editor-meta">
      <span class="selection-pip" aria-hidden="true"></span>
      <span>按段落拆分翻译，保留原文顺序与行内格式</span>
    </div>
    <div class="editor-footer">
      <div class="mini-actions">
        <button class="text-button" id="paste" type="button" title="从剪贴板读取文字">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M9 4.5V3.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v.7H9Z" fill="currentColor"/></svg>
          剪贴板
        </button>
        <button class="text-button" id="clear" type="button" title="清空">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          清空
        </button>
      </div>
      <button class="primary-button" id="translate" type="button" disabled>
        <span class="button-spinner" aria-hidden="true"></span>
        <span id="translate-label">全文翻译</span>
      </button>
    </div>
  </div>

  <div class="progress-card" id="progress" role="status" hidden>
    <div class="progress-line">
      <span class="spinner" aria-hidden="true"></span>
      <span class="progress-text" id="progress-text">正在翻译…</span>
      <button class="text-button progress-cancel" id="cancel" type="button">取消</button>
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
        <button class="text-button" id="error-retry" type="button">重试</button>
      </div>
    </div>
  </div>

  <div class="result-area" id="result-area" hidden aria-live="polite">
    <div class="result-toolbar">
      <div class="display-switch" role="group" aria-label="显示方式">
        <button class="display-option is-active" data-display="bilingual" type="button" aria-pressed="true">对照</button>
        <button class="display-option" data-display="translation" type="button" aria-pressed="false">译文</button>
        <button class="display-option" data-display="source" type="button" aria-pressed="false">原文</button>
      </div>
      <div class="result-tools">
        <span class="result-meta" id="result-meta"></span>
        <button class="icon-button icon-button-small copy-button" id="copy" type="button" aria-label="复制译文" title="复制译文">
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="8.5" width="10" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 5.5h-8a2 2 0 0 0-2 2v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 12.5 4.1 4 8.9-9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    <div class="result" id="result"></div>
  </div>

  <div class="empty-state" id="empty">
    <div class="empty-art" aria-hidden="true">
      <span class="doc-line doc-line-long"></span>
      <span class="doc-line"></span>
      <span class="doc-line doc-line-short"></span>
      <span class="doc-accent">译</span>
    </div>
    <p class="empty-title">长文，也有从容的读法</p>
    <p class="empty-copy">粘贴文章或 Markdown，按段落生成对照译文。翻译由 OpenChamber 已配置的模型完成，无需额外 API Key。</p>
  </div>

  <p class="privacy-note">
    <span class="privacy-dot" aria-hidden="true"></span>
    文本交给 OpenChamber 当前模型 · 不写入会话
  </p>
</div>
`;
