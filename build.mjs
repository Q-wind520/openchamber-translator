import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'panel/main.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/main.ts -> panel/main.js');
} else {
  await build(options);
}
