import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
export const flagDirectory = join(dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
export const fontDirectory = fileURLToPath(new URL('./fonts/', import.meta.url));
export const zeroRuntimePath = '/api/public/popup-banners/zero-block/runtime.js';
let bundle;

export function zeroRuntimeScript() {
  bundle ||= build({
    entryPoints: [fileURLToPath(new URL('./storefront.mjs', import.meta.url))],
    write: false, bundle: true, format: 'iife', globalName: '__mtZeroBlockRuntimeModule',
    platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'eof'
  }).then(({ outputFiles }) => outputFiles[0].text).catch((error) => {
    bundle = null;
    throw error;
  });
  return bundle;
}
