import assert from 'node:assert/strict';
import test from 'node:test';
import { readRemotePhotoTargets, verifyPhotoTransfer } from '../src/modules/search/horoshop/photo-verification.js';

const old = 'https://shop.example/content/old.webp';
const added = 'https://shop.example/content/new.webp';
const submitted = ['https://workspace.example/media/catalog/library/upload.webp'];
const base = { before: [old], after: [old, added], submitted, mode: 'append', publicOrigin: 'https://workspace.example' };
const fails = (input) => assert.throws(() => verifyPhotoTransfer(input), { code: 'HOROSHOP_PHOTO_VERIFICATION_FAILED' });

test('photo verification confirms new independent images in append and replace modes', () => {
  assert.deepEqual(verifyPhotoTransfer(base), [old, added]);
  assert.deepEqual(verifyPhotoTransfer({ ...base, mode: 'replace', after: [added] }), [added]);
});

test('existing photos, partial imports, missing baselines and workspace links cannot authorize deletion', () => {
  fails({ ...base, after: [old], mode: 'replace' });
  fails({ ...base, submitted: [...submitted, 'https://workspace.example/two.webp'] });
  fails({ ...base, before: null });
  fails({ ...base, after: [old, submitted[0]] });
  fails({ ...base, after: [old, 'https://workspace.example/alias.webp'] });
  fails({ ...base, after: [old, 'https://alias.example/media/catalog/library/upload.webp'] });
  fails({ ...base, after: [added] });
  fails({ ...base, mode: 'replace' });
});

test('scoped verification reads paginated nested modifications and the separate common gallery', async () => {
  const targets = [
    { id: 'common', article: 'PARENT', parentArticle: 'PARENT', targetType: 'gallery_common' },
    { id: 'offer', article: 'BLUE', parentArticle: 'PARENT', targetType: 'images' }
  ];
  const calls = [];
  const result = await readRemotePhotoTargets({ async exportCatalog(...args) {
    calls.push(args);
    return args[1] === 0
      ? { products: [{ article: 'OTHER', images: [old] }], nextOffset: 100 }
      : { products: [{ article: 'PARENT', gallery_common: [old], modifications: [
        { article: 'RED', images: ['https://shop.example/red.webp'] },
        { article: 'BLUE', images: { links: [{ url: '/content/new.webp' }] } }
      ] }], nextOffset: null };
  } }, 'token', targets, 'shop.example');
  assert.deepEqual(result.get('common'), [old]);
  assert.deepEqual(result.get('offer'), [added]);
  assert.deepEqual(calls.map((args) => args.slice(1)), [[0, 100, ['PARENT']], [100, 100, ['PARENT']]]);
});

test('verification rejects missing targets, malformed galleries and repeated export pages', async () => {
  const targets = [{ id: 'offer', article: 'BLUE', parentArticle: 'PARENT', targetType: 'images' }];
  for (const response of [
    { products: [{ article: 'PARENT', images: [added] }], nextOffset: null },
    { products: [{ article: 'BLUE', parent_article: 'PARENT', images: ['javascript:alert(1)'] }], nextOffset: null },
    { products: [{ article: 'BLUE', parent_article: 'PARENT', images: [added, added] }], nextOffset: null },
    { products: [{ article: 'BLUE', parent_article: 'PARENT' }], nextOffset: null },
    { products: [], nextOffset: 0 }
  ]) await assert.rejects(() => readRemotePhotoTargets({ exportCatalog: async () => response }, 'token', targets, 'shop.example'),
    { code: 'HOROSHOP_PHOTO_VERIFICATION_FAILED' });
  await assert.rejects(() => readRemotePhotoTargets({ exportCatalog: async (_token, offset) => ({
    products: [{ article: 'OTHER' }], nextOffset: offset + 100
  }) }, 'token', targets, 'shop.example'), { code: 'HOROSHOP_PHOTO_VERIFICATION_FAILED' });
});
