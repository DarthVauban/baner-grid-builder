import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build, loadConfigFromFile } from 'vite';

test('production map modules stay below the Vite chunk budget and retain a standalone worker', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const files = [result].flat().flatMap((bundle) => bundle.output);
  const mapChunks = files.filter((file) => file.type === 'chunk'
    && (file.fileName.includes('/maplibre-') || Object.keys(file.modules).some((id) => id.includes('/maplibre-gl/'))));
  assert.ok(mapChunks.length >= 2, 'MapLibre must not be folded into a single oversized module');
  for (const chunk of mapChunks) {
    assert.ok(Buffer.byteLength(chunk.code) <= 500_000, `${chunk.fileName} exceeds 500 kB`);
  }
  assert.ok(files.some((file) => file.type === 'asset' && /maplibre-gl-worker-.*\.js$/u.test(file.fileName)));
  const workspace = files.find((file) => file.type === 'chunk' && file.isEntry && file.name === 'workspace');
  assert.ok(workspace);
  const byName = new Map(files.filter((file) => file.type === 'chunk').map((file) => [file.fileName, file]));
  const initialImports = new Set();
  function visit(chunk) {
    if (!chunk || initialImports.has(chunk.fileName)) return;
    initialImports.add(chunk.fileName);
    chunk.imports.forEach((name) => visit(byName.get(name)));
  }
  visit(workspace);
  assert.ok(mapChunks.every((chunk) => !initialImports.has(chunk.fileName)), 'Workspace startup must not download MapLibre');
});

test('shader extraction preserves Unicode, escapes, nested literals, tagged templates and interpolation', async () => {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' });
  const plugin = loaded.config.plugins.flat(Infinity).find((item) => item?.name === 'maplibre-shader-chunks');
  assert.ok(plugin);
  const shader = 'uniform vec4 color;\n'.repeat(90) + '// Україна 🌍 \\ ` ${literal}';
  const literal = '`' + shader.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') + '`';
  const source = `
    const label = 'Україна 🌍';
    const __mtMapLibreShader_0 = 'existing binding';
    const shader = ${literal};
    export function values(suffix) {
      const nested = ${literal};
      const dynamic = \`uniform vec4 color;${' '.repeat(1100)}\${suffix}\`;
      const tagged = String.raw${literal};
      return [label, __mtMapLibreShader_0, shader, nested, dynamic, tagged];
    }
  `;
  const entry = '/node_modules/maplibre-gl/dist/maplibre-gl.mjs';
  const bundle = await build({ configFile: false, logLevel: 'silent', plugins: [plugin, {
    name: 'shader-fixture',
    resolveId(id) { return id === 'fixture' ? entry : null; },
    load(id) { return id === entry ? source : null; }
  }], build: { write: false, rollupOptions: { input: 'fixture', preserveEntrySignatures: 'strict', output: { format: 'iife', name: 'ShaderFixture' } } } });
  const context = {};
  runInNewContext(bundle.output.find((file) => file.type === 'chunk').code, context);
  const values = Array.from(context.ShaderFixture.values('dynamic suffix'));
  assert.deepEqual(values.slice(0, 4), ['Україна 🌍', 'existing binding', shader, shader]);
  assert.equal(values[4], 'uniform vec4 color;' + ' '.repeat(1100) + 'dynamic suffix');
  assert.equal(values[5], literal.slice(1, -1));
});
