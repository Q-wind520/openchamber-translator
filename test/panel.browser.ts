import { HostRequestError, type JsonValue } from '@openchamber/sdk';
import { mountApp, type AppHandle } from '../src/panel/app';
import { UI_LOCALES } from '../src/panel/i18n';

const root = document.querySelector<HTMLElement>('#root')!;
const output = document.querySelector<HTMLElement>('#test-results')!;
const results: string[] = [];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await wait(10);
  }
  throw new Error('Timed out waiting for UI state');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function assert(value: unknown, description: string): asserts value {
  if (!value) throw new Error(description);
}
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  assert(found, `Missing #${id}`);
  return found as T;
}
let currentApp: AppHandle | null = null;
function documentLang(): string { return document.documentElement.lang; }
function setHostLocale(value: string): void {
  if (!currentApp) throw new Error('No mounted app');
  currentApp.updateHostLocale(value);
}

function checkLayout(): void {
  assert(document.documentElement.scrollWidth <= innerWidth, 'no page overflow');
  for (const id of ['char-count', 'selection-meta']) {
    const node = element(id);
    assert(node.scrollWidth <= node.clientWidth + 1, `${id} is not clipped`);
  }
  for (const [left, right] of [['.brand', '.target-control'], ['.card-top > label', '.card-tools'], ['.selection-heading', '.selection-actions'], ['.display-switch', '.result-tools']]) {
    const a = document.querySelector<HTMLElement>(left!)!.getBoundingClientRect();
    const b = document.querySelector<HTMLElement>(right!)!.getBoundingClientRect();
    const overlaps = Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1;
    assert(!overlaps, `${left} does not overlap ${right}`);
  }
}

async function fixture(locale = 'en-US', values = new Map<string, JsonValue>()) {
  const calls: { prompt: string; system?: string }[] = [];
  const toasts: string[] = [];
  let generate = async () => ({ text: 'translated text' });
  let write = async () => {};
  let read = async () => 'clipboard text';
  let failSave = false;
  const host = {
    storage: {
      get: async (key: string) => values.get(key),
      set: async (key: string, value: JsonValue) => { if (failSave) throw new Error('storage unavailable'); values.set(key, value); },
      delete: async (key: string) => { values.delete(key); }, keys: async () => [...values.keys()],
    },
    generate: async (request: { prompt: string; system?: string }) => { calls.push(request); return generate(); },
    writeClipboard: async (_text: string) => write(),
    toast: async ({ message }: { message: string }) => { toasts.push(message); },
  };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => read() } });
  const app = await mountApp({ host, root, ready: { locale } });
  currentApp = app;
  return {
    app, calls, toasts, values,
    setGenerate(fn: typeof generate) { generate = fn; },
    setWrite(fn: typeof write) { write = fn; },
    setRead(fn: typeof read) { read = fn; },
    failSave(value: boolean) { failSave = value; },
  };
}

async function test(name: string, body: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture();
  try { await body(f); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${String(error)}`); }
  finally { f.app.dispose(); currentApp = null; root.replaceChildren(); }
}

async function run() {
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview) {
    const f = await fixture();
    setHostLocale(preview);
    if (new URLSearchParams(location.search).get('theme') === 'dark') {
      for (const [key, value] of Object.entries({ background: '#17191d', foreground: '#eeeef2', subtle: '#24272d', elevated: '#202329', 'muted-foreground': '#a9adb7' })) {
        document.documentElement.style.setProperty(`--surface-${key}`, value);
      }
      document.documentElement.style.colorScheme = 'dark';
    }
    document.body.style.background = 'var(--tp-bg)';
    const input = element<HTMLTextAreaElement>('source-input');
    input.value = 'Original paragraph for translation.\n\nA second paragraph with more text.'; input.dispatchEvent(new Event('input'));
    element('translate').click(); await until(() => !element('result-area').hidden);
    input.setSelectionRange(0, 8); input.dispatchEvent(new Event('select'));
    await until(() => !element('selection-output').hidden);
    checkLayout();
    output.hidden = true;
    document.body.dataset.testStatus = 'PREVIEW';
    assert(f.calls.length > 0, 'preview rendered');
    return;
  }
  await test('manual switch preserves original and selection', async () => {
    const input = element<HTMLTextAreaElement>('source-input');
    input.value = 'Original text'; input.dispatchEvent(new Event('input'));
    input.setSelectionRange(1, 5);
    setHostLocale('ru');
    assert(document.documentElement.lang === 'ru', 'Russian document language');
    assert(input === element('source-input') && input.value === 'Original text', 'same input and content');
    assert(input.selectionStart === 1 && input.selectionEnd === 5, 'selection preserved');
    assert(element('translate-label').textContent === 'Перевести всё', 'Russian button');
  });
  await test('every locale, accessible attributes and icons', async () => {
    for (const locale of UI_LOCALES) {
      setHostLocale(locale);
      assert(document.documentElement.lang === locale, `lang ${locale}`);
      assert(document.documentElement.dir === (locale === 'ar' || locale === 'he' ? 'rtl' : 'ltr'), `dir ${locale}`);
      assert(element<HTMLTextAreaElement>('source-input').placeholder.length > 0, 'placeholder');
      assert(element('paste').getAttribute('aria-label'), 'paste accessible name');
      assert(element('copy').querySelectorAll('svg').length === 2, 'SVG survives translation');
      assert(!document.getElementById('ui-language'), 'no manual language selector');
    }
    setHostLocale('en');
  });
  await test('result, selection card, mode, collapse and scroll survive switching', async (f) => {
    const translated = 'translated text '.repeat(200);
    f.setGenerate(async () => ({ text: translated }));
    const input = element<HTMLTextAreaElement>('source-input');
    input.value = 'Hello world\n'.repeat(50); input.dispatchEvent(new Event('input'));
    element('translate').click(); await until(() => !element('result-area').hidden);
    const paragraph = element('result').firstChild;
    document.querySelector<HTMLButtonElement>('[data-display="translation"]')!.click();
    const translation = element('result').firstChild;
    const result = element('result');
    result.scrollTop = 40;
    assert(result.scrollTop === 40, 'result is actually scrollable');
    element('collapse').click();
    input.setSelectionRange(0, 5); input.dispatchEvent(new Event('select'));
    await until(() => !element('selection-output').hidden);
    const output = element('selection-output');
    output.scrollTop = 40;
    input.scrollTop = 40;
    assert(output.scrollTop === 40 && input.scrollTop === 40, 'selection and input are actually scrollable');
    const count = f.calls.length;
    setHostLocale('ru');
    assert(paragraph !== null && translation === element('result').firstChild, 'result nodes retained');
    assert(element('result').hidden && element('result').classList.contains('mode-translation'), 'collapse and mode');
    assert(output.textContent === translated.trim() && !element('selection-card').hidden, 'selection card retained');
    assert(output.scrollTop === 40 && input.scrollTop === 40, 'selection and input scroll retained');
    assert(input.selectionStart === 0 && input.selectionEnd === 5, 'selection retained');
    assert(f.calls.length === count, 'no extra model request');
    element('collapse').click();
    assert(result.scrollTop === 40, 'result scroll retained after expanding');
  });
  await test('inflight request, progress, target and cancellation survive switching', async (f) => {
    const pending = deferred<{ text: string }>(); f.setGenerate(() => pending.promise);
    const input = element<HTMLTextAreaElement>('source-input');
    input.value = 'Hello'; input.dispatchEvent(new Event('input'));
    const target = element<HTMLSelectElement>('target-language'); target.value = 'ja'; target.dispatchEvent(new Event('change'));
    element('translate').click(); await until(() => f.calls.length === 1);
    setHostLocale('ru');
    assert(f.calls.length === 1 && target.value === 'ja' && f.calls[0]?.system?.includes('Japanese'), 'independent target');
    assert(element('translate-label').textContent === 'Перевод…', 'busy label');
    element('cancel').click(); setHostLocale('en');
    assert(element('progress-text').textContent === 'Cancelling…', 'cancellation phase retained');
    pending.resolve({ text: 'ignored' }); await until(() => element('progress').hidden === true);
    assert(element('result-area').hidden, 'cancelled result not shown');
  });
  await test('inflight selection completes in the new language', async (f) => {
    const pending = deferred<{ text: string }>(); f.setGenerate(() => pending.promise);
    const input = element<HTMLTextAreaElement>('source-input'); input.value = 'Hello'; input.dispatchEvent(new Event('input'));
    input.setSelectionRange(0, 5); input.dispatchEvent(new Event('select'));
    await until(() => f.calls.length === 1); setHostLocale('ru');
    pending.resolve({ text: 'selection result' }); await until(() => !element('selection-output').hidden);
    assert(element('selection-output').textContent === 'selection result', 'selection result');
    assert(element('selection-meta').textContent?.includes('символов'), 'new locale metadata');
  });
  await test('copy timeout and deferred clipboard use latest locale', async (f) => {
    const input = element<HTMLTextAreaElement>('source-input'); input.value = 'Hello'; input.dispatchEvent(new Event('input'));
    element('translate').click(); await until(() => !element('result-area').hidden);
    element('copy').click(); await until(() => element('copy').classList.contains('is-copied'));
    setHostLocale('ru'); assert(element('copy').title === 'Скопировано', 'copied label updated');
    await until(() => !element('copy').classList.contains('is-copied'));
    assert(element('copy').title === 'Скопировать перевод', 'timer did not restore old locale');
    const pending = deferred<string>(); f.setRead(() => pending.promise);
    element('paste').click(); setHostLocale('en'); pending.resolve('clipboard content');
    await until(() => f.toasts.includes('Clipboard read.'));
    assert(input.value === 'clipboard content', 'deferred paste content');
  });
  await test('errors, selection limits and unsafe diagnostics rerender as text', async (f) => {
    f.setGenerate(async () => { throw new HostRequestError('NO_MODEL', 'model not configured'); });
    const input = element<HTMLTextAreaElement>('source-input'); input.value = 'Hello'; input.dispatchEvent(new Event('input'));
    element('translate').click(); await until(() => !element('error').hidden);
    setHostLocale('ru'); assert(element('error-message').textContent?.includes('Small Model не настроена'), 'known error translated');
    f.setGenerate(async () => { throw new Error('<img src=x onerror=alert(1)>'); });
    element('error-retry').click(); await until(() => element('error-message').textContent?.includes('<img') === true);
    assert(!element('error-message').querySelector('img'), 'diagnostics are not HTML');
    setHostLocale('en'); assert(element('error-message').textContent?.includes('Translation did not complete'), 'generic message translated');
    input.value = 'x'.repeat(2001); input.dispatchEvent(new Event('input')); input.setSelectionRange(0, 2001); input.dispatchEvent(new Event('select'));
    await until(() => !element('selection-error').hidden); setHostLocale('ru');
    assert(element('selection-error-message').textContent?.includes('Выделено более'), 'selection limit updated');
  });
  await test('save failure, reopen and automatic host updates', async (f) => {
    setHostLocale('ru');
    f.failSave(true);
    element('auto-selection-toggle').click();
    await until(() => f.toasts.some((text) => text.includes('Не удалось сохранить')));
    assert(documentLang() === 'ru', 'failed save does not change the locale');
    f.failSave(false);
    f.app.dispose(); const reopened = await fixture('en-US', f.values);
    try {
      assert(documentLang() === 'en', 'host locale on reopen');
      reopened.app.updateHostLocale('zh-TW'); assert(documentLang() === 'zh-TW', 'traditional Chinese host locale');
      reopened.app.updateHostLocale('fr-FR'); assert(documentLang() === 'fr', 'supported host locale');
      reopened.app.updateHostLocale('RU_ru'); assert(documentLang() === 'ru', 'live host locale');
    } finally { reopened.app.dispose(); }
  });
  output.textContent = results.join('\n');
  document.body.dataset.testStatus = results.some((r) => r.startsWith('FAIL')) ? 'FAIL' : 'PASS';
}
void run().catch((error: unknown) => { output.textContent = `FAIL fixture: ${String(error)}`; document.body.dataset.testStatus = 'FAIL'; });
