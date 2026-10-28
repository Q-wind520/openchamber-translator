import type { GuestMessage, HostReadyContext, JsonValue } from '@openchamber/sdk';

const result = document.querySelector<HTMLElement>('#result')!;
const envelope = { channel: 'openchamber.sdk', v: 1 };
const results: string[] = [];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function assert(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(10); }
  throw new Error('Timed out waiting for startup');
}

function context(locale: string): HostReadyContext {
  return {
    locale, surface: 'panel', session: null, directory: null,
    connection: { connected: false, account: '' }, settings: {}, item: null,
    theme: { mode: 'light', tokens: {
      background: '#fff', elevated: '#f8f8fa', foreground: '#1d2025', muted: '#6b7280',
      subtle: '#f2f3f5', border: '#ddd', hover: '#eee', selection: '#ddd', focus: '#167a68',
      primary: '#167a68', mutedSurface: '#f2f3f5', elevatedForeground: '#1d2025', active: '#ddd',
      selectionForeground: '#1d2025', primaryForeground: '#fff', primaryText: '#167a68',
      successText: '#167a68', warningText: '#805000', errorText: '#d92d20', infoText: '#2684ff',
      success: '#167a68', warning: '#805000', error: '#d92d20', info: '#2684ff',
      font: 'system-ui', mono: 'monospace', radius: '10px',
    } },
  };
}

async function scenario(name: string, options: { noReady?: boolean; hold?: boolean; rejectStorage?: boolean; mountFailure?: boolean; manual?: string }, check: (f: ReturnType<typeof setup>) => Promise<void>) {
  const f = setup(options);
  try { await check(f); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${String(error)}`); }
  finally { f.dispose(); }
}

function setup(options: { noReady?: boolean; hold?: boolean; rejectStorage?: boolean; mountFailure?: boolean; manual?: string }) {
  const frame = document.createElement('iframe');
  let gets = 0;
  let release = () => {};
  let saved: JsonValue = { uiLanguage: options.manual ?? 'auto', targetLanguage: 'ja', displayMode: 'bilingual', autoSelection: true };
  const send = (data: object) => frame.contentWindow?.postMessage({ ...envelope, ...data }, location.origin);
  const ready = (locale: string) => send({ type: 'ready', payload: context(locale) });
  const onMessage = (event: MessageEvent<GuestMessage>) => {
    const data = event.data;
    if (event.source !== frame.contentWindow || data?.channel !== envelope.channel) return;
    if (data.type === 'hello') { if (!options.noReady) ready('en-US'); return; }
    if (data.type !== 'storage') return;
    if (data.payload.op === 'get') {
      gets++;
      release = () => {
        if (options.mountFailure) {
          const doc = frame.contentDocument!;
          const get = doc.getElementById.bind(doc);
          doc.getElementById = (id) => id === 'target-language' ? null : get(id);
        }
        send(options.rejectStorage
          ? { type: 'result', id: data.id, ok: false, code: 'HOST_REJECTED', error: 'fixture storage failure' }
          : { type: 'result', id: data.id, ok: true, payload: { storage: true, op: 'get', found: true, value: saved } });
      };
      if (!options.hold) release();
    } else if (data.payload.op === 'set') {
      saved = data.payload.value;
      send({ type: 'result', id: data.id, ok: true, payload: { storage: true, op: 'set' } });
    }
  };
  window.addEventListener('message', onMessage);
  frame.src = './panel/index.html';
  document.body.append(frame);
  return {
    doc: () => frame.contentDocument!, ready, release: () => release(), gets: () => gets,
    dispose: () => { window.removeEventListener('message', onMessage); frame.remove(); },
  };
}

async function run() {
  await scenario('no host uses English timeout', { noReady: true }, async (f) => {
    await until(() => Boolean(f.doc()?.querySelector('.boot')));
    assert(f.doc().documentElement.lang === 'en', 'English startup lang');
    await wait(6100);
    assert(f.doc().querySelector('.fatal')?.textContent?.includes('Cannot connect to OpenChamber'), 'English connection failure');
  });
  await scenario('saved language localizes mount failure', { manual: 'ru', mountFailure: true }, async (f) => {
    await until(() => Boolean(f.doc()?.querySelector('.fatal')));
    assert(f.doc().querySelector('.fatal')?.textContent?.includes('Не удалось загрузить'), 'Russian failure');
    assert(f.doc().documentElement.lang === 'ru', 'fatal document locale');
    assert(f.gets() === 1, 'single storage read');
  });
  await scenario('storage rejection falls back to automatic host locale', { rejectStorage: true }, async (f) => {
    await until(() => Boolean(f.doc()?.getElementById('ui-language')));
    f.ready('ru-RU'); await until(() => f.doc().documentElement.lang === 'ru');
    assert(f.gets() === 1, 'no second load');
  });
  await scenario('latest ready wins during storage and after startup', { hold: true }, async (f) => {
    await until(() => f.gets() === 1);
    f.ready('ru-RU'); await wait(30); f.release();
    await until(() => Boolean(f.doc()?.getElementById('ui-language')));
    assert(f.doc().documentElement.lang === 'ru', 'latest ready during storage');
    const input = f.doc().querySelector<HTMLTextAreaElement>('#source-input')!; input.value = 'Kept original';
    const target = f.doc().querySelector<HTMLSelectElement>('#target-language')!;
    f.ready('zh-TW'); await until(() => f.doc().documentElement.lang === 'zh-CN');
    assert(input === f.doc().getElementById('source-input') && input.value === 'Kept original' && target.value === 'ja', 'ready preserves user state');
    const select = f.doc().querySelector<HTMLSelectElement>('#ui-language')!;
    select.value = 'ru'; select.dispatchEvent(new Event('change'));
    f.ready('en-US'); await wait(30);
    assert(f.doc().documentElement.lang === 'ru', 'manual override');
    select.value = 'auto'; select.dispatchEvent(new Event('change'));
    assert(f.doc().documentElement.lang === 'en', 'auto uses latest ready');
    assert(f.gets() === 1, 'one storage load across ready updates');
  });
  result.textContent = results.join('\n');
  document.body.dataset.testStatus = results.some((line) => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
}
void run().catch((error: unknown) => { result.textContent = `FAIL fixture: ${String(error)}`; document.body.dataset.testStatus = 'FAIL'; });
