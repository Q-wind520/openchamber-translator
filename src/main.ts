import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { mountApp, type AppHandle } from './panel/app';

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');

const host = connectHost();
const panelRoot: HTMLElement = root;
let app: AppHandle | null = null;
let booting = false;

function showFatal(message: string): void {
  panelRoot.replaceChildren();
  const container = document.createElement('div');
  container.className = 'fatal';
  container.textContent = message;
  panelRoot.append(container);
}

const bootTimer = window.setTimeout(() => {
  if (app) return;
  showFatal('无法连接 OpenChamber。请从 设置 → 扩展 打开翻译面板。');
}, 6_000);

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (app) return;
  if (booting) return;
  booting = true;
  window.clearTimeout(bootTimer);

  void mountApp({ host, root: panelRoot, ready: context })
    .then((handle) => {
      app = handle;
    })
    .catch((error: unknown) => {
      console.error('Failed to mount translation panel', error);
      showFatal(
        error instanceof Error
          ? `翻译面板加载失败：${error.message}`
          : '翻译面板加载失败，请重新打开。',
      );
    });
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(bootTimer);
  app?.dispose();
  host.dispose();
});
