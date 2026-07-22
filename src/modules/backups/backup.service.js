import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { catalogMediaDir } from '../catalog/catalog.media.js';
import { getTelegramCredentials, telegramApiRequest } from '../integrations/integration.service.js';
import { createBackupArchive, readBackupArchive } from './backup-archive.js';
import { enterMaintenance, getMaintenanceReason, leaveMaintenance } from './maintenance.service.js';

const TELEGRAM_DOCUMENT_LIMIT_BYTES = 50 * 1024 * 1024;
const SAFE_TELEGRAM_DOCUMENT_LIMIT_BYTES = 49 * 1024 * 1024;
const MAX_BACKUP_SOURCE_BYTES = 128 * 1024 * 1024;
const BACKUP_FORMAT = 'mt-workspace-backup';
const BACKUP_FORMAT_VERSION = 1;
const backupSigningKey = crypto.scryptSync(env.JWT_SECRET, 'mt-workspace-backups-v1', 32);
const excludedDataTables = new Set(['schema_migrations']);
let backupOperationActive = false;

export class BackupError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BackupError';
    this.status = status;
    this.code = code;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signManifest(manifest) {
  return crypto.createHmac('sha256', backupSigningKey).update(JSON.stringify(manifest)).digest('hex');
}

function serializeDatabaseValue(value) {
  if (Buffer.isBuffer(value)) return { __mtBackupType: 'buffer', base64: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  return value;
}

function deserializeDatabaseValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.__mtBackupType === 'buffer') {
    return Buffer.from(String(value.base64 || ''), 'base64');
  }
  return value;
}

function parseJsonEntry(entry, code) {
  try {
    return JSON.parse(entry.toString('utf8'));
  } catch {
    throw new BackupError(422, code, 'Архів резервної копії пошкоджений або має невідомий формат.');
  }
}

function validateTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new BackupError(422, 'INVALID_TIMEZONE', 'Вкажіть коректний часовий пояс.');
  }
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second)
  };
}

function zonedDateTimeToUtc(parts, timezone) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let guess = desired;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const adjustment = desired - actualAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function calculateNextBackupAt(settings, from = new Date()) {
  if (!settings.automaticEnabled) return null;
  const timezone = validateTimezone(settings.timezone);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(settings.scheduleTime);
  if (!timeMatch) throw new BackupError(422, 'INVALID_SCHEDULE_TIME', 'Вкажіть коректний час резервного копіювання.');
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) throw new BackupError(422, 'INVALID_SCHEDULE_TIME', 'Вкажіть коректний час резервного копіювання.');

  const localNow = zonedParts(from, timezone);
  let dayOffset = 0;
  if (settings.scheduleType === 'weekly') {
    const currentWeekday = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day)).getUTCDay() || 7;
    dayOffset = (settings.scheduleWeekday - currentWeekday + 7) % 7;
  }

  let dateParts = addLocalDays(localNow, dayOffset);
  let candidate = zonedDateTimeToUtc({ ...dateParts, hour, minute }, timezone);
  if (candidate.getTime() <= from.getTime()) {
    dateParts = addLocalDays(dateParts, settings.scheduleType === 'weekly' ? 7 : 1);
    candidate = zonedDateTimeToUtc({ ...dateParts, hour, minute }, timezone);
  }
  return candidate;
}

function serializeBackupSettings(row) {
  const scheduleTime = String(row?.schedule_time || '03:00').slice(0, 5);
  return {
    automaticEnabled: row?.automatic_enabled === true,
    scheduleType: row?.schedule_type || 'daily',
    scheduleTime,
    scheduleWeekday: Number(row?.schedule_weekday || 1),
    timezone: row?.timezone || 'Europe/Kyiv',
    nextRunAt: row?.next_run_at || null,
    lastRunAt: row?.last_run_at || null,
    updatedAt: row?.updated_at || null
  };
}

function serializeBackupRun(row) {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    fileName: row.file_name || '',
    sizeBytes: Number(row.size_bytes || 0),
    telegramMessageId: row.telegram_message_id === null ? null : Number(row.telegram_message_id),
    errorMessage: row.error_message || '',
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

export async function getBackupSettings(db = { query }) {
  const result = await db.query('SELECT * FROM backup_settings WHERE id = TRUE');
  return serializeBackupSettings(result.rows[0]);
}

export async function saveBackupSettings(input, userId) {
  if (input.automaticEnabled && !await getTelegramCredentials()) {
    throw new BackupError(422, 'TELEGRAM_NOT_CONFIGURED', 'Спочатку підключіть Telegram-бота.');
  }
  const normalized = {
    automaticEnabled: input.automaticEnabled,
    scheduleType: input.scheduleType,
    scheduleTime: input.scheduleTime,
    scheduleWeekday: input.scheduleWeekday,
    timezone: validateTimezone(input.timezone)
  };
  const nextRunAt = calculateNextBackupAt(normalized);
  const result = await query(
    `UPDATE backup_settings
     SET automatic_enabled = $1,
         schedule_type = $2,
         schedule_time = $3::time,
         schedule_weekday = $4,
         timezone = $5,
         next_run_at = $6,
         updated_by = $7,
         updated_at = NOW()
     WHERE id = TRUE
     RETURNING *`,
    [normalized.automaticEnabled, normalized.scheduleType, normalized.scheduleTime,
      normalized.scheduleWeekday, normalized.timezone, nextRunAt, userId]
  );
  return serializeBackupSettings(result.rows[0]);
}

export async function listBackupRuns(limit = 12, db = { query }) {
  const result = await db.query(
    `SELECT * FROM backup_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(serializeBackupRun);
}

async function databaseSnapshot(db = { query }) {
  const tableResult = await db.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const tables = [];

  for (const { table_name: tablename } of tableResult.rows) {
    if (excludedDataTables.has(tablename)) continue;
    const columnsResult = await db.query(
      `SELECT column_name, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tablename]
    );
    const rowsResult = await db.query(`SELECT * FROM ${quoteIdentifier(tablename)}`);
    tables.push({
      name: tablename,
      columns: columnsResult.rows.map((column) => ({ name: column.column_name, udtName: column.udt_name })),
      rows: rowsResult.rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, serializeDatabaseValue(value)])
      ))
    });
  }

  return { tables };
}

async function latestMigration(db = { query }) {
  const result = await db.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1');
  return result.rows[0]?.name || '';
}

function backupFileName(createdAt) {
  const stamp = createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '-').replace('T', '_');
  return `mt-workspace-backup_${stamp}.tar.gz`;
}

export async function buildWorkspaceBackup({ now = new Date(), db = { query }, mediaDir = catalogMediaDir } = {}) {
  const snapshot = await databaseSnapshot(db);
  const databaseData = Buffer.from(JSON.stringify(snapshot), 'utf8');
  if (databaseData.length > MAX_BACKUP_SOURCE_BYTES) {
    throw new BackupError(413, 'BACKUP_SOURCE_TOO_LARGE', 'Дані резервної копії завеликі для безпечного надсилання через Telegram.');
  }
  const mediaEntries = [];
  const archiveEntries = [{ name: 'database.json', data: databaseData }];
  let sourceBytes = databaseData.length;
  const directoryEntries = await readdir(mediaDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });

  for (const entry of directoryEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    if (path.basename(entry.name) !== entry.name || Buffer.byteLength(`media/${entry.name}`, 'utf8') > 100) continue;
    const data = await readFile(path.join(mediaDir, entry.name));
    sourceBytes += data.length;
    if (sourceBytes > MAX_BACKUP_SOURCE_BYTES) {
      throw new BackupError(413, 'BACKUP_SOURCE_TOO_LARGE', 'Дані й медіафайли завеликі для безпечного надсилання через Telegram.');
    }
    mediaEntries.push({ name: entry.name, size: data.length, sha256: sha256(data) });
    archiveEntries.push({ name: `media/${entry.name}`, data });
  }

  const unsignedManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: now.toISOString(),
    buildSha: env.APP_BUILD_SHA,
    schemaMigration: await latestMigration(db),
    databaseSha256: sha256(databaseData),
    tableCount: snapshot.tables.length,
    media: mediaEntries
  };
  const manifest = { ...unsignedManifest, signature: signManifest(unsignedManifest) };
  archiveEntries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });
  const archive = createBackupArchive(archiveEntries, { modifiedAt: now });

  return {
    archive,
    fileName: backupFileName(now),
    createdAt: now,
    tableCount: snapshot.tables.length,
    mediaCount: mediaEntries.length
  };
}

function verifyWorkspaceBackup(archive) {
  let entries;
  try {
    entries = readBackupArchive(archive);
  } catch {
    throw new BackupError(422, 'INVALID_BACKUP_ARCHIVE', 'Архів резервної копії пошкоджений або має невідомий формат.');
  }
  const manifestEntry = entries.get('manifest.json');
  const databaseEntry = entries.get('database.json');
  if (!manifestEntry || !databaseEntry) {
    throw new BackupError(422, 'INVALID_BACKUP_ARCHIVE', 'Архів не містить обов’язкових файлів резервної копії.');
  }
  const manifest = parseJsonEntry(manifestEntry, 'INVALID_BACKUP_MANIFEST');
  const database = parseJsonEntry(databaseEntry, 'INVALID_BACKUP_DATABASE');
  if (manifest.format !== BACKUP_FORMAT || manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError(422, 'UNSUPPORTED_BACKUP_FORMAT', 'Ця версія формату резервної копії не підтримується.');
  }
  const { signature, ...unsignedManifest } = manifest;
  const expectedSignature = signManifest(unsignedManifest);
  const suppliedSignature = Buffer.from(String(signature || ''), 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (suppliedSignature.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedSignature, expectedBuffer)) {
    throw new BackupError(422, 'INVALID_BACKUP_SIGNATURE', 'Підпис архіву недійсний. Використайте оригінальний архів цієї інсталяції.');
  }
  if (sha256(databaseEntry) !== manifest.databaseSha256 || !Array.isArray(database.tables)) {
    throw new BackupError(422, 'BACKUP_CHECKSUM_MISMATCH', 'Контрольна сума бази даних не збігається.');
  }

  const media = new Map();
  for (const item of Array.isArray(manifest.media) ? manifest.media : []) {
    if (!item || path.basename(item.name) !== item.name) throw new BackupError(422, 'INVALID_BACKUP_MEDIA', 'Архів містить некоректний шлях медіафайлу.');
    const data = entries.get(`media/${item.name}`);
    if (!data || data.length !== item.size || sha256(data) !== item.sha256) {
      throw new BackupError(422, 'BACKUP_CHECKSUM_MISMATCH', `Медіафайл ${item.name} пошкоджений.`);
    }
    media.set(item.name, data);
  }
  return { manifest, database, media };
}

async function currentDatabaseMetadata(db) {
  const columnsResult = await db.query(
    `SELECT table_name, column_name, udt_name, is_nullable, column_default, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );
  const primaryKeysResult = await db.query(
    `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY tc.table_name, kcu.ordinal_position`
  );
  const foreignKeysResult = await db.query(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
     FROM information_schema.table_constraints AS tc
     JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage AS ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'`
  );
  const tables = new Map();
  for (const column of columnsResult.rows) {
    if (excludedDataTables.has(column.table_name)) continue;
    if (!tables.has(column.table_name)) tables.set(column.table_name, { columns: new Map(), primaryKeys: [], foreignKeys: [] });
    tables.get(column.table_name).columns.set(column.column_name, column);
  }
  for (const key of primaryKeysResult.rows) tables.get(key.table_name)?.primaryKeys.push(key.column_name);
  for (const key of foreignKeysResult.rows) tables.get(key.table_name)?.foreignKeys.push(key);
  return tables;
}

function insertionOrder(metadata) {
  const pending = new Set(metadata.keys());
  const resolved = new Set();
  const order = [];
  while (pending.size) {
    let progressed = false;
    for (const tableName of [...pending]) {
      const table = metadata.get(tableName);
      const dependencies = table.foreignKeys
        .filter((key) => table.columns.get(key.column_name)?.is_nullable === 'NO')
        .map((key) => key.foreign_table_name)
        .filter((name) => name !== tableName && metadata.has(name));
      if (dependencies.every((name) => resolved.has(name))) {
        order.push(tableName);
        resolved.add(tableName);
        pending.delete(tableName);
        progressed = true;
      }
    }
    if (!progressed) throw new BackupError(422, 'BACKUP_SCHEMA_INCOMPATIBLE', 'Не вдалося визначити безпечний порядок відновлення таблиць.');
  }
  return order;
}

function databaseParameter(value, column) {
  const decoded = deserializeDatabaseValue(value);
  if (decoded !== null && ['json', 'jsonb'].includes(column.udt_name)) return JSON.stringify(decoded);
  return decoded;
}

function deferredColumnNames(table) {
  return table.foreignKeys
    .filter((key) => table.columns.get(key.column_name)?.is_nullable === 'YES')
    .map((key) => key.column_name);
}

async function restoreDatabase(snapshot, schemaMigration) {
  const client = await pool.connect();
  try {
    const migration = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [schemaMigration]);
    if (!migration.rows[0]) {
      throw new BackupError(422, 'BACKUP_FROM_NEWER_VERSION', 'Архів створено новішою версією застосунку. Спочатку оновіть робочий простір.');
    }
    const metadata = await currentDatabaseMetadata(client);
    const snapshotTables = new Map(snapshot.tables.map((table) => [table.name, table]));
    for (const [name, table] of snapshotTables) {
      if (!metadata.has(name) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
        throw new BackupError(422, 'BACKUP_SCHEMA_INCOMPATIBLE', `Таблиця ${name} несумісна з поточною схемою.`);
      }
    }

    await client.query('BEGIN');
    const tableNames = [...metadata.keys()];
    if (tableNames.length) {
      await client.query(`TRUNCATE TABLE ${tableNames.map(quoteIdentifier).join(', ')} CASCADE`);
    }

    for (const tableName of insertionOrder(metadata)) {
      const source = snapshotTables.get(tableName);
      if (!source) continue;
      const table = metadata.get(tableName);
      const sourceColumns = new Set(source.columns.map((column) => column.name));
      const insertColumns = [...table.columns.keys()].filter((name) => sourceColumns.has(name));
      for (const column of table.columns.values()) {
        if (!sourceColumns.has(column.column_name) && column.is_nullable === 'NO' && column.column_default === null) {
          throw new BackupError(422, 'BACKUP_SCHEMA_INCOMPATIBLE', `В архіві немає обов’язкового поля ${tableName}.${column.column_name}.`);
        }
      }
      const nullableForeignKeys = new Set(deferredColumnNames(table));
      const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
      const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders})`;
      for (const row of source.rows) {
        const values = insertColumns.map((columnName) => nullableForeignKeys.has(columnName)
          ? null
          : databaseParameter(row[columnName], table.columns.get(columnName)));
        await client.query(sql, values);
      }
    }

    for (const [tableName, source] of snapshotTables) {
      const table = metadata.get(tableName);
      const nullableForeignKeys = deferredColumnNames(table);
      if (!nullableForeignKeys.length) continue;
      if (!table.primaryKeys.length) throw new BackupError(422, 'BACKUP_SCHEMA_INCOMPATIBLE', `Таблиця ${tableName} не має ключа для відновлення зв’язків.`);
      for (const row of source.rows) {
        const fields = nullableForeignKeys.filter((columnName) => row[columnName] !== null && row[columnName] !== undefined);
        if (!fields.length) continue;
        const values = fields.map((columnName) => databaseParameter(row[columnName], table.columns.get(columnName)));
        const whereValues = table.primaryKeys.map((columnName) => databaseParameter(row[columnName], table.columns.get(columnName)));
        const setSql = fields.map((columnName, index) => `${quoteIdentifier(columnName)} = $${index + 1}`).join(', ');
        const whereSql = table.primaryKeys.map((columnName, index) => `${quoteIdentifier(columnName)} = $${fields.length + index + 1}`).join(' AND ');
        await client.query(`UPDATE ${quoteIdentifier(tableName)} SET ${setSql} WHERE ${whereSql}`, [...values, ...whereValues]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function stageMedia(media) {
  await mkdir(catalogMediaDir, { recursive: true });
  const suffix = crypto.randomUUID();
  const stagingDir = path.join(catalogMediaDir, `.restore-staging-${suffix}`);
  const previousDir = path.join(catalogMediaDir, `.restore-previous-${suffix}`);
  await mkdir(stagingDir, { recursive: true });
  await mkdir(previousDir, { recursive: true });
  for (const [name, data] of media) await writeFile(path.join(stagingDir, name), data, { flag: 'wx' });
  return { stagingDir, previousDir, movedPrevious: [], movedStaged: [] };
}

async function swapMedia(stage) {
  const { stagingDir, previousDir } = stage;
  const current = await readdir(catalogMediaDir, { withFileTypes: true });
  for (const entry of current) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    await rename(path.join(catalogMediaDir, entry.name), path.join(previousDir, entry.name));
    stage.movedPrevious.push(entry.name);
  }
  const staged = await readdir(stagingDir, { withFileTypes: true });
  for (const entry of staged) {
    if (!entry.isFile()) continue;
    await rename(path.join(stagingDir, entry.name), path.join(catalogMediaDir, entry.name));
    stage.movedStaged.push(entry.name);
  }
}

async function rollbackMedia(stage) {
  for (const name of stage.movedStaged) {
    await rm(path.join(catalogMediaDir, name), { force: true });
  }
  for (const name of stage.movedPrevious) {
    await rename(path.join(stage.previousDir, name), path.join(catalogMediaDir, name));
  }
}

async function cleanupMediaStage(stage) {
  await rm(stage.stagingDir, { recursive: true, force: true });
  await rm(stage.previousDir, { recursive: true, force: true });
}

async function recordBackupRun({ trigger, status, fileName = '', sizeBytes = 0, telegramMessageId = null, errorMessage = '', createdBy = null, startedAt }) {
  const result = await query(
    `INSERT INTO backup_runs (
       trigger, status, file_name, size_bytes, telegram_message_id, error_message,
       created_by, started_at, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [trigger, status, fileName, sizeBytes, telegramMessageId, errorMessage.slice(0, 4000), createdBy, startedAt]
  );
  return serializeBackupRun(result.rows[0]);
}

function readableBackupDate(date, timezone = 'Europe/Kyiv') {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

export async function createAndSendBackup({ trigger = 'manual', userId = null, now = new Date() } = {}) {
  if (backupOperationActive) throw new BackupError(409, 'BACKUP_BUSY', 'Інша операція з резервною копією вже виконується.');
  backupOperationActive = true;
  const startedAt = now;
  let fileName = '';
  let sizeBytes = 0;
  try {
    const credentials = await getTelegramCredentials();
    if (!credentials) throw new BackupError(422, 'TELEGRAM_NOT_CONFIGURED', 'Спочатку підключіть Telegram-бота.');
    const settings = await getBackupSettings();
    const backup = await buildWorkspaceBackup({ now });
    fileName = backup.fileName;
    sizeBytes = backup.archive.length;
    if (sizeBytes > SAFE_TELEGRAM_DOCUMENT_LIMIT_BYTES) {
      const sizeMb = (sizeBytes / 1024 / 1024).toFixed(1);
      throw new BackupError(413, 'BACKUP_TOO_LARGE', `Архів має ${sizeMb} МБ і перевищує ліміт Telegram 50 МБ.`);
    }
    const form = new FormData();
    form.append('chat_id', credentials.chatId);
    form.append('caption', `Резервна копія MT Workspace\nСтворено: ${readableBackupDate(now, settings.timezone)} (${settings.timezone})\nТаблиць: ${backup.tableCount}; медіафайлів: ${backup.mediaCount}`);
    form.append('document', new Blob([backup.archive], { type: 'application/gzip' }), backup.fileName);
    const message = await telegramApiRequest(credentials.token, 'sendDocument', form, { timeoutMs: 120_000 });
    const run = await recordBackupRun({
      trigger, status: 'success', fileName, sizeBytes,
      telegramMessageId: message.message_id ?? null, createdBy: userId, startedAt
    });
    await query('UPDATE backup_settings SET last_run_at = $1 WHERE id = TRUE', [now]);
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Невідома помилка резервного копіювання.';
    await recordBackupRun({ trigger, status: 'failed', fileName, sizeBytes, errorMessage: message, createdBy: userId, startedAt }).catch(() => {});
    throw error;
  } finally {
    backupOperationActive = false;
  }
}

export async function restoreWorkspaceBackup(archive, { userId = null, now = new Date() } = {}) {
  if (backupOperationActive) throw new BackupError(409, 'BACKUP_BUSY', 'Інша операція з резервною копією вже виконується.');
  if (!Buffer.isBuffer(archive) || !archive.length) throw new BackupError(422, 'BACKUP_FILE_REQUIRED', 'Виберіть архів резервної копії.');
  backupOperationActive = true;
  const maintenanceReason = `backup-restore-${crypto.randomUUID()}`;
  let stage;
  let mediaSwapStarted = false;
  let restoreCommitted = false;
  try {
    const verified = verifyWorkspaceBackup(archive);
    if (!enterMaintenance(maintenanceReason)) throw new BackupError(409, 'MAINTENANCE_ACTIVE', 'Система вже виконує технічне обслуговування.');
    stage = await stageMedia(verified.media);
    mediaSwapStarted = true;
    await swapMedia(stage);
    await restoreDatabase(verified.database, verified.manifest.schemaMigration);
    restoreCommitted = true;
    await cleanupMediaStage(stage).catch((error) => console.error('Could not remove backup restore staging directories', error));
    stage = null;
    const run = await recordBackupRun({
      trigger: 'restore', status: 'success',
      fileName: backupFileName(new Date(verified.manifest.createdAt)),
      sizeBytes: archive.length, createdBy: null, startedAt: now
    });
    return { run, backupCreatedAt: verified.manifest.createdAt };
  } catch (error) {
    if (!restoreCommitted) {
      if (mediaSwapStarted && stage) await rollbackMedia(stage).catch(() => {});
      if (stage) await cleanupMediaStage(stage).catch(() => {});
      await recordBackupRun({
        trigger: 'restore', status: 'failed', sizeBytes: archive.length,
        errorMessage: error instanceof Error ? error.message : 'Невідома помилка відновлення.',
        createdBy: userId, startedAt: now
      }).catch(() => {});
    }
    throw error;
  } finally {
    leaveMaintenance(maintenanceReason);
    backupOperationActive = false;
  }
}

export async function processDueBackups({ now = new Date() } = {}) {
  if (getMaintenanceReason()) return null;
  const client = await pool.connect();
  let settings;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM backup_settings
       WHERE id = TRUE AND automatic_enabled = TRUE AND next_run_at <= $1
       FOR UPDATE SKIP LOCKED`,
      [now]
    );
    if (!result.rows[0]) {
      await client.query('COMMIT');
      return null;
    }
    settings = serializeBackupSettings(result.rows[0]);
    const nextRunAt = calculateNextBackupAt(settings, new Date(now.getTime() + 60_000));
    await client.query('UPDATE backup_settings SET next_run_at = $1 WHERE id = TRUE', [nextRunAt]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return createAndSendBackup({ trigger: 'scheduled', now }).catch((error) => {
    console.error('Scheduled backup failed', error);
    return null;
  });
}

export const backupLimits = {
  telegramDocumentBytes: TELEGRAM_DOCUMENT_LIMIT_BYTES,
  safeTelegramDocumentBytes: SAFE_TELEGRAM_DOCUMENT_LIMIT_BYTES
};
