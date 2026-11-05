import { AppError } from '../../../lib/app-error.js';

function verificationError() {
  return new AppError(502, 'HOROSHOP_PHOTO_VERIFICATION_FAILED',
    'Завантаження всіх фото у Хорошопі ще не підтверджено. Копії у сховищі збережено.');
}

function imageLinks(source, field, storeDomain) {
  if (!Object.hasOwn(source, field)) throw verificationError();
  const block = source[field];
  const items = Array.isArray(block) ? block : block?.links;
  if (!Array.isArray(items)) throw verificationError();
  const links = items.map((item) => {
    const value = typeof item === 'string' ? item : item?.url || item?.src;
    if (!value) throw verificationError();
    let url;
    try { url = new URL(value, `https://${storeDomain}/`); }
    catch { throw verificationError(); }
    if (url.protocol !== 'https:' || url.username || url.password) throw verificationError();
    url.hash = '';
    return url.href;
  });
  if (new Set(links).size !== links.length) throw verificationError();
  return links;
}

// Both grouped exports (modifications/variants) and flat offer rows are valid.
// Never substitute the parent gallery or another modification's images.
export async function readRemotePhotoTargets(client, token, targets, storeDomain) {
  const found = new Map();
  const offsets = new Set();
  const fingerprints = new Set();
  const parents = [...new Set(targets.map((target) => target.parentArticle))];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    if (offsets.has(offset)) throw verificationError();
    offsets.add(offset);
    const result = await client.exportCatalog(token, offset, 100, parents);
    if (!Array.isArray(result?.products)) throw verificationError();
    const fingerprint = JSON.stringify(result.products);
    if (result.products.length && fingerprints.has(fingerprint)) throw verificationError();
    fingerprints.add(fingerprint);
    for (const source of result.products) {
      const parent = String(source.parent_article ?? source.article ?? source.sku ?? '');
      for (const target of targets) {
        if (parent !== target.parentArticle) continue;
        const nested = source.modifications ?? source.variants;
        const candidates = target.targetType === 'gallery_common'
          ? [source]
          : Array.isArray(nested) && nested.length ? nested : [source];
        for (const candidate of candidates) {
          if (target.targetType === 'images'
            && String(candidate.article ?? candidate.sku ?? '') !== target.article) continue;
          const links = imageLinks(candidate, target.targetType, storeDomain);
          const previous = found.get(target.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(links)) throw verificationError();
          found.set(target.id, links);
        }
      }
    }
    if (result.nextOffset === null) {
      if (found.size !== targets.length) throw verificationError();
      return found;
    }
    if (!Number.isInteger(result.nextOffset) || result.nextOffset <= offset) throw verificationError();
    offset = result.nextOffset;
  }
  throw verificationError();
}

export function verifyPhotoTransfer({ before, after, submitted, mode, publicOrigin }) {
  if (!Array.isArray(before) || !Array.isArray(after) || !submitted.length) throw verificationError();
  const previous = new Set(before);
  const added = after.filter((url) => !previous.has(url));
  // A successful API envelope or an unchanged gallery with the same number of
  // images is not proof of an upload. Require every newly submitted image.
  if (added.length !== submitted.length
    || (mode === 'replace' && after.length !== submitted.length)
    || (mode === 'append' && before.some((url) => !after.includes(url)))) throw verificationError();
  const origin = new URL(publicOrigin).origin;
  for (const value of added) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin === origin
      || url.pathname.startsWith('/media/catalog/library/')
      || submitted.includes(value)) throw verificationError();
  }
  return after;
}
