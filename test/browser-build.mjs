import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(process.argv[2] ?? '/tmp/opencode/locale-russian/browser');
await mkdir(`${out}/panel`, { recursive: true });
await build({ entryPoints: ['test/panel.browser.ts'], outfile: `${out}/panel.browser.js`, bundle: true, format: 'esm', platform: 'browser', target: 'chrome120' });
await copyFile('test/panel.browser.html', `${out}/index.html`);
await copyFile('panel/style.css', `${out}/style.css`);
await build({ entryPoints: ['test/boot.browser.ts'], outfile: `${out}/boot.browser.js`, bundle: true, format: 'esm', platform: 'browser', target: 'chrome120' });
await build({ entryPoints: ['src/main.ts'], outfile: `${out}/panel/main.js`, bundle: true, format: 'iife', platform: 'browser', target: 'chrome120' });
await copyFile('test/boot.browser.html', `${out}/boot.browser.html`);
await copyFile('panel/index.html', `${out}/panel/index.html`);
await copyFile('panel/style.css', `${out}/panel/style.css`);
console.log(`Browser regression fixture: ${out}/index.html`);
