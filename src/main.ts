import { connectHost, type HostReadyContext } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { mountApp, type AppHandle } from './panel/app';
import { message, resolveUiLocale, type UiLocale } from './panel/i18n';
import { loadPreferences } from './panel/preferences';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const host = connectHost();
const panelRoot: HTMLElement = root;
let app: AppHandle | null = null;
let booting = false;
let latestReady: HostReadyContext | null = null;
let bootLocale: UiLocale = 'en';

function showFatal(message: string): void {
  document.documentElement.lang = bootLocale;
  panelRoot.replaceChildren();
  const container = document.createElement('div');
  container.className = 'fatal';
  container.textContent = message;
  panelRoot.append(container);
}

const bootTimer = window.setTimeout(() => {
  if (app) return;
  showFatal(message('en', 'connectionFailed'));
}, 6_000);

host.onReady((context) => {
  latestReady = context;
  applyHostReady(context, document.documentElement);
  if (app) {
    app.updateHostLocale(context.locale);
    return;
  }
  if (booting) return;
  booting = true;
  window.clearTimeout(bootTimer);

  void (async () => {
    const preferences = await loadPreferences(host, context.locale);
    const ready = latestReady ?? context;
    bootLocale = resolveUiLocale(ready.locale);
    document.documentElement.lang = bootLocale;
    return mountApp({ host, root: panelRoot, ready, preferences });
  })()
    .then((handle) => {
      app = handle;
      if (latestReady) app.updateHostLocale(latestReady.locale);
    })
    .catch((error: unknown) => {
      console.error('Failed to mount translation panel', error);
      showFatal(`${message(bootLocale, 'loadFailed')}${error instanceof Error ? `: ${error.message}` : ''}`);
    });
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(bootTimer);
  app?.dispose();
  host.dispose();
});
