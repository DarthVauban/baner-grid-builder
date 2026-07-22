import { gzipSync, gunzipSync } from 'node:zlib';

const TAR_BLOCK_SIZE = 512;
const MAX_UNCOMPRESSED_BACKUP_BYTES = 256 * 1024 * 1024;

function assertArchivePath(name) {
  if (!name || Buffer.byteLength(name, 'utf8') > 100) throw new Error('INVALID_ARCHIVE_PATH');
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) {
    throw new Error('INVALID_ARCHIVE_PATH');
  }
}

function writeString(buffer, offset, length, value) {
  const source = Buffer.from(String(value), 'utf8');
  source.copy(buffer, offset, 0, Math.min(source.length, length));
}

function writeOctal(buffer, offset, length, value) {
  const digits = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, '0').slice(-(length - 1));
  writeString(buffer, offset, length, `${digits}\0`);
}

function createTarHeader(name, size, modifiedAt = new Date()) {
  assertArchivePath(name);
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(modifiedAt.getTime() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar');
  writeString(header, 263, 2, '00');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumDigits = checksum.toString(8).padStart(6, '0').slice(-6);
  writeString(header, 148, 8, `${checksumDigits}\0 `);
  return header;
}

export function createBackupArchive(entries, { modifiedAt = new Date() } = {}) {
  const chunks = [];

  for (const entry of entries) {
    assertArchivePath(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    chunks.push(createTarHeader(entry.name, data.length, modifiedAt), data);
    const padding = (TAR_BLOCK_SIZE - (data.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding, 0));
  }

  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

function readString(buffer, offset, length) {
  const end = buffer.indexOf(0, offset);
  const boundedEnd = end === -1 || end > offset + length ? offset + length : end;
  return buffer.toString('utf8', offset, boundedEnd).trim();
}

function isEmptyBlock(buffer, offset) {
  for (let index = offset; index < offset + TAR_BLOCK_SIZE; index += 1) {
    if (buffer[index] !== 0) return false;
  }
  return true;
}

export function readBackupArchive(archive) {
  let tar;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_UNCOMPRESSED_BACKUP_BYTES });
  } catch {
    throw new Error('INVALID_BACKUP_ARCHIVE');
  }

  const entries = new Map();
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= tar.length) {
    if (isEmptyBlock(tar, offset)) break;
    const name = readString(tar, offset, 100);
    assertArchivePath(name);
    const sizeText = readString(tar, offset + 124, 12);
    const size = Number.parseInt(sizeText || '0', 8);
    const type = String.fromCharCode(tar[offset + 156] || 48);
    if (!Number.isSafeInteger(size) || size < 0 || type !== '0') throw new Error('INVALID_BACKUP_ARCHIVE');

    const dataStart = offset + TAR_BLOCK_SIZE;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length || entries.has(name)) throw new Error('INVALID_BACKUP_ARCHIVE');
    entries.set(name, Buffer.from(tar.subarray(dataStart, dataEnd)));
    offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return entries;
}

export const backupArchiveLimits = {
  maxUncompressedBytes: MAX_UNCOMPRESSED_BACKUP_BYTES
};
