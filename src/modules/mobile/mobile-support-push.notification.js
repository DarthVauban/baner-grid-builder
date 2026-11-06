const graphemes = new Intl.Segmenter('uk', { granularity: 'grapheme' });
const fallbackBody = 'Нове повідомлення';

function singleLine(value) {
  return String(value || '').replace(/[\uD800-\uDFFF]/gu, '\uFFFD').normalize('NFC')
    .replace(/[\p{White_Space}\p{Cc}\p{Bidi_Control}\u200B\uFEFF]+/gu, ' ').trim();
}

function encodedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8') - 2;
}

function excerpt(text, limit, byteLimit) {
  const segments = [...graphemes.segment(text)].map((item) => item.segment);
  if (segments.length <= limit && encodedBytes(text) <= byteLimit) return text;
  const kept = [];
  let bytes = encodedBytes('…');
  for (const segment of segments) {
    const size = encodedBytes(segment);
    if (kept.length >= limit - 1 || bytes + size > byteLimit) break;
    kept.push(segment);
    bytes += size;
  }
  return kept.join('').trimEnd() + '…';
}

export function buildSupportPushNotification({ visitorId, visitorName, body }) {
  const anonymous = singleLine(String(visitorId || '').slice(0, 6)) || 'Клієнт';
  const name = excerpt(singleLine(visitorName) || anonymous, 40, 256);
  const text = singleLine(body) || fallbackBody;
  const bodyExcerpt = excerpt(text, 180, 1536);
  // JSON-escaped UTF-8 caps leave room for unchanged routing inside FCM's 4 KiB.
  // A single oversized grapheme is never split just to fit a preview.
  return {
    title: name === '…' ? anonymous : name,
    body: bodyExcerpt === '…' ? fallbackBody : bodyExcerpt
  };
}
