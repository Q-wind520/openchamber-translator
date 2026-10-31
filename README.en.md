# OpenChamber Translator

[简体中文](README.md) · [English](README.en.md) · [Русский](README.ru.md)

A sidebar extension for OpenChamber focused on **full-text translation**, with **live translation of selected text** in the original editor.

- Translates long texts paragraph by paragraph, with "Both / Translation / Original" views.
- The translation card has a height limit and its own scroll, and can be collapsed or expanded with one click, so long texts do not fill the sidebar.
- Automatically translates text selected in the original field into a separate selection card; no translate button is needed.
- Uses the **Small Model** already configured in OpenChamber, so no API key is needed in the extension.
- If DeepSeek is already configured in OpenCode, just point Small Model at it.
- Shows translation progress, allows cancellation, and copies the result with one click.
- Automatically follows OpenChamber's light/dark theme and font.
- The interface automatically follows OpenChamber's interface language, supporting all 15 OpenChamber languages (English, Deutsch, Français, Nederlands, 简体中文, 繁體中文, Українська, Español, Português (Brasil), 한국어, Polski, 日本語, Türkçe, العربية, עברית), plus Russian.

## Requirements

- OpenChamber `>= 2.5.1` (web or desktop)
- Node.js `>= 22.12` (build only)

## Build and install

```bash
npm install
npm run check
```

The build artifact is `panel/main.js`. OpenChamber does not compile extension source code, so build before installing.

In OpenChamber:

1. Open **Settings → Extensions**.
2. Enter the absolute path to this repository in "Folder, ZIP or URL", for example:
   `/path/to/openchamber-translation`
3. Click Add and approve the "Use your Small Model" permission.
4. Click the "Translator" icon in the sidebar to open the panel.

During development you can install from the folder directly: after changing `src/`, run `npm run dev` (or `npm run build`) and reload the panel.

## Using DeepSeek / switching models

The extension does not store model keys and does not call DeepSeek directly. It uses your Small Model through the OpenChamber SDK's `host.generate`:

1. Make sure DeepSeek is configured in the OpenCode / OpenChamber providers.
2. Open **Settings → Sessions → Small Model**.
3. Select DeepSeek, for example `deepseek/deepseek-flash`.
4. Return to the Translator panel and translate.

> The OpenChamber extension API only exposes Small Model generation; the extension cannot choose or read a specific provider/model. The model actually used is whatever your Small Model setting points to.
>
> If the current Small Model is unavailable, the panel reports that no model is available; change the setting and try again.

## Translation

### Interface language

The panel has no separate language selector and always follows OpenChamber's interface language. Languages are matched from OpenChamber locale codes (`zh-Hans`/`zh-CN` → Simplified Chinese, `zh-Hant`/`zh-TW` → Traditional Chinese, `pt` → Brazilian Portuguese, `iw` → Hebrew, etc.); missing, malformed, or unsupported languages use English. Arabic and Hebrew automatically switch to a right-to-left layout.

When OpenChamber changes its interface language, the panel updates immediately without reloading, interrupting an in-progress translation, or changing the target language. The original text and result are not lost, but the extension does not persist them.

### Full-text translation

1. Paste an article or Markdown into the input, or click "Read clipboard".
2. Choose the target language, then click "Translate all" or press `Ctrl/Cmd + Enter`.
3. While translating, you can see the number of completed paragraphs and cancel.
4. Results support:
   - **Both**: source and translation side by side, paragraph by paragraph;
   - **Translation**: translation only;
   - **Original**: original only.
5. The translation area is capped at about 52% of the viewport height (520px max) and scrolls inside the card beyond that; the collapse button in the toolbar folds the translation to one line.
6. The copy button in the top-right copies only the translation.

A single full-text translation is limited to 50,000 characters. Long texts are split on blank lines, and overly long paragraphs are split at sentence boundaries; short paragraphs are grouped into batches (up to 4 paragraphs / about 3,000 characters per request) to reduce the number of model calls. If the model does not return the expected segment format, the extension automatically falls back to translating one segment at a time.

### Live selection translation

1. The "Auto-translate selection" toggle at the top of the editor is on by default; when off, selections are not translated automatically.
2. Select text in the "Original" input with the mouse or keyboard; after about 450ms it is translated automatically, with no button press.
3. The result appears in the "Selection translation" card below the original; you can copy it, close it, or retry on failure.
4. Rapid selection changes are queued serially and always use the latest selection; results from stale in-flight requests are discarded.
5. A selection is limited to 2,000 characters to avoid excess calls when a long text is selected by accident; use full-text translation for longer content.

Selection translation only works inside the extension panel's original input; it does not read selections from OpenChamber or other browser pages.

## Permissions and privacy

The extension requests a single capability:

```json
"capabilities": ["model"]
```

- No network access, no local services, no project file access.
- No translation-service integration and no separate API key.
- Original text is sent through OpenChamber's Small Model to the model provider configured in OpenCode; it consumes that model's quota.
- Original text and translations are not persisted or written to OpenChamber sessions; the extension only persists the target language, display mode, and auto-selection toggle in `preferences-v2`.
- Copying large results is limited by OpenChamber's 32,000-character clipboard limit; copy in parts.

## Development

```bash
npm run dev        # esbuild watch -> panel/main.js
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
npm run check      # typecheck + test + production build
```

A repeatable real-browser panel regression (no model API needed; the build script produces both the panel and boot checks):

```bash
node test/browser-build.mjs
python3 -m http.server 4389 --bind 127.0.0.1 --directory /tmp/opencode/locale-russian/browser
```

Open `http://127.0.0.1:4389/` and `http://127.0.0.1:4389/boot.browser.html` in a browser and confirm both show `PASS` (`FAIL` on failure). You can pass a different output directory as the argument to `browser-build.mjs` to suit other platforms. If Chrome is installed, you can also run the checks headlessly:

```bash
google-chrome --headless --no-sandbox --user-data-dir=/tmp/opencode/locale-russian/chrome-profile --virtual-time-budget=30000 --dump-dom http://127.0.0.1:4389/
google-chrome --headless --no-sandbox --user-data-dir=/tmp/opencode/locale-russian/chrome-profile --virtual-time-budget=30000 --dump-dom http://127.0.0.1:4389/boot.browser.html
```

Layout:

```text
src/
  main.ts                     OpenChamber host bootstrap and theme integration
  panel/
    app.ts                    Full-text/selection translation and card interactions
    preferences.ts            Target language / display mode persistence
    template.ts               Static panel structure
  translation/
    plan.ts                   Paragraph splitting, long-sentence splitting, batching, progress, cancellation
    errors.ts                 Error types
    languages.ts              Target languages
    providers/
      opencode.ts             host.generate translation calls
panel/
  index.html                  Extension entry page
  style.css                   Panel styles (using host theme variables)
  main.js                     Build artifact
icon.svg                      Sidebar icon
build.mjs                     Bundler script (IIFE)
```

## Limitations

- Using Small Model means speed and quality depend on the model configured in OpenChamber.
- Each model request covers at most 4 paragraphs / about 3,000 characters; a single paragraph over 2,000 characters is split first, and a full text is limited to 50,000 characters.
- Cancelling stops further paragraph requests, but a model call already in progress may still complete.
- No screenshot translation or full-page DOM injection; selection translation only works in the panel's original input, because the OpenChamber sandbox does not allow extensions to read selections from external pages.
- Selection translation calls the model automatically once the selection settles, consuming Small Model quota; turn off the selection card if you do not need it, to avoid accidental calls.
