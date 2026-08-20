import { pool as defaultPool } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { createMediaAsset, ensureMediaFolder } from '../../media/media.service.js';
import { removeMediaImage } from '../../media/media.storage.js';
import { convertPhotoParserImageToWebp } from '../../catalog/photo-parser.service.js';
import { horoshopPhotoService } from './photo.service.js';
import {
  createPhotoDesktopCredential,
  generatePhotoDesktopPairingCode,
  hashPhotoDesktopAccessToken,
  hashPhotoDesktopPairingCode
} from './photo-desktop.crypto.js';

const pairingTtlMs = 10 * 60 * 1000;
const leaseTtlMs = 10 * 60 * 1000;

function jsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localizedTitle(value, fallback = '') {
  const titles = jsonObject(value);
  return String(titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback || '').trim();
}

function photoTargetTitle(value, sku, fallback = '') {
  const normalizedSku = String(sku || '').trim().toLocaleLowerCase('uk-UA');
  for (const candidate of [localizedTitle(value), fallback]) {
    const title = String(candidate || '').trim();
    if (title && title.toLocaleLowerCase('uk-UA') !== normalizedSku) return title;
  }
  return 'Назва товару не вказана';
}

function serializeDevice(row) {
  return {
    id: row.id,
    name: row.name,
    appVersion: row.app_version || '',
    capabilities: jsonObject(row.capabilities),
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at || null,
    revokedAt: row.revoked_at || null
  };
}

function cleanError(error, fallback = 'Не вдалося обробити фотографії') {
  return String(error?.message || fallback).replace(/\s+/gu, ' ').trim().slice(0, 1_000);
}

async function assertUserPhotoAccess(db, userId) {
  const result = await db.query(`
    SELECT users.id, users.status, users.role, users.two_factor_enabled,
           COALESCE(requirement.requires_two_factor, FALSE) AS requires_two_factor,
           COALESCE(access.explicit_access, FALSE) AS explicit_access
    FROM users
    LEFT JOIN tool_security_requirements AS requirement
      ON requirement.tool_id = 'horoshop_photo_parser'
    LEFT JOIN (
      SELECT user_id, TRUE AS explicit_access
      FROM user_tool_access
      WHERE tool_id = 'horoshop_photo_parser'
    ) AS access ON access.user_id = users.id
    WHERE users.id = $1
  `, [userId]);
  const user = result.rows[0];
  if (!user || user.status !== 'approved') {
    throw new AppError(401, 'PHOTO_DESKTOP_USER_INVALID', 'Користувач підключення більше не активний.');
  }
  if (user.role !== 'admin' && user.explicit_access !== true) {
    throw new AppError(403, 'TOOL_ACCESS_DENIED', 'Немає доступу до інструмента фотографій Хорошоп.');
  }
  if (user.requires_two_factor === true && user.two_factor_enabled !== true) {
    throw new AppError(403, 'TOOL_2FA_REQUIRED', 'Для цього інструмента потрібно увімкнути 2FA.');
  }
  return user;
}

export class HoroshopPhotoDesktopService {
  constructor(options = {}) {
    this.pool = options.databasePool || defaultPool;
    this.photoService = options.photoService || horoshopPhotoService;
    this.createAsset = options.createAsset || createMediaAsset;
    this.selectionSyncs = new Map();
    this.targetFolderSyncs = new Map();
  }

  async createPairing(userId) {
    const code = generatePhotoDesktopPairingCode();
    const expiresAt = new Date(Date.now() + pairingTtlMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await assertUserPhotoAccess(client, userId);
      await client.query(`
        UPDATE search_horoshop_photo_parser_pairings
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE user_id = $1 AND status = 'pending'
      `, [userId]);
      const result = await client.query(`
        INSERT INTO search_horoshop_photo_parser_pairings (
          user_id, manual_code_hash, expires_at
        ) VALUES ($1, $2, $3)
        RETURNING id, status, expires_at, created_at
      `, [userId, hashPhotoDesktopPairingCode(code), expiresAt]);
      await client.query('COMMIT');
      return {
        id: result.rows[0].id,
        status: result.rows[0].status,
        manualCode: code,
        expiresAt: result.rows[0].expires_at,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async pairing(userId, pairingId) {
    const result = await this.pool.query(`
      SELECT pairing.*, device.name AS device_name, device.app_version,
             device.capabilities, device.paired_at, device.last_seen_at, device.revoked_at
      FROM search_horoshop_photo_parser_pairings AS pairing
      LEFT JOIN search_horoshop_photo_parser_devices AS device
        ON device.id = pairing.claimed_device_id
      WHERE pairing.id = $1 AND pairing.user_id = $2
    `, [pairingId, userId]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'PHOTO_DESKTOP_PAIRING_NOT_FOUND', 'Код підключення не знайдено.');
    if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) {
      await this.pool.query(`
        UPDATE search_horoshop_photo_parser_pairings SET status = 'expired'
        WHERE id = $1 AND status = 'pending'
      `, [row.id]);
      row.status = 'expired';
    }
    return {
      id: row.id,
      status: row.status,
      expiresAt: row.expires_at,
      device: row.claimed_device_id ? serializeDevice({
        id: row.claimed_device_id,
        name: row.device_name,
        app_version: row.app_version,
        capabilities: row.capabilities,
        paired_at: row.paired_at,
        last_seen_at: row.last_seen_at,
        revoked_at: row.revoked_at
      }) : null
    };
  }

  async claimPairing({ code, deviceName, appVersion = '', installationId = null, capabilities = {} }) {
    const client = await this.pool.connect();
    const credential = createPhotoDesktopCredential();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        SELECT * FROM search_horoshop_photo_parser_pairings
        WHERE manual_code_hash = $1
        FOR UPDATE
      `, [hashPhotoDesktopPairingCode(code)]);
      const pairing = result.rows[0];
      if (!pairing) throw new AppError(404, 'PHOTO_DESKTOP_PAIRING_INVALID', 'Код підключення недійсний.');
      if (pairing.status !== 'pending') {
        throw new AppError(409, 'PHOTO_DESKTOP_PAIRING_USED', 'Цей код підключення вже неактивний.');
      }
      if (new Date(pairing.expires_at).getTime() <= Date.now()) {
        await client.query(`UPDATE search_horoshop_photo_parser_pairings SET status = 'expired' WHERE id = $1`, [pairing.id]);
        throw new AppError(410, 'PHOTO_DESKTOP_PAIRING_EXPIRED', 'Термін дії коду підключення завершився.');
      }
      await assertUserPhotoAccess(client, pairing.user_id);
      let device;
      if (installationId) {
        const existing = await client.query(`
          SELECT id FROM search_horoshop_photo_parser_devices
          WHERE user_id = $1 AND installation_id = $2
          FOR UPDATE
        `, [pairing.user_id, installationId]);
        if (existing.rows[0]) {
          const updated = await client.query(`
            UPDATE search_horoshop_photo_parser_devices
            SET name = $2, access_token_hash = $3, app_version = $4,
                capabilities = $5::jsonb, revoked_at = NULL, last_seen_at = NOW(), updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `, [
            existing.rows[0].id, deviceName, credential.accessTokenHash,
            appVersion, JSON.stringify(capabilities)
          ]);
          device = updated.rows[0];
        }
      }
      if (!device) {
        const inserted = await client.query(`
          INSERT INTO search_horoshop_photo_parser_devices (
            user_id, name, installation_id, access_token_hash, app_version,
            capabilities, last_seen_at
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
          RETURNING *
        `, [
          pairing.user_id, deviceName, installationId, credential.accessTokenHash,
          appVersion, JSON.stringify(capabilities)
        ]);
        device = inserted.rows[0];
      }
      await client.query(`
        UPDATE search_horoshop_photo_parser_pairings
        SET status = 'claimed', claimed_device_id = $2, claimed_at = NOW()
        WHERE id = $1
      `, [pairing.id, device.id]);
      await client.query('COMMIT');
      return { accessToken: credential.accessToken, device: serializeDevice(device) };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(accessToken) {
    const result = await this.pool.query(`
      SELECT device.*, users.status AS user_status, users.role,
             users.two_factor_enabled
      FROM search_horoshop_photo_parser_devices AS device
      INNER JOIN users ON users.id = device.user_id
      WHERE device.access_token_hash = $1
    `, [hashPhotoDesktopAccessToken(accessToken)]);
    const device = result.rows[0];
    if (!device) throw new AppError(401, 'PHOTO_DESKTOP_TOKEN_INVALID', 'Токен десктопного парсера недійсний.');
    if (device.revoked_at) throw new AppError(401, 'PHOTO_DESKTOP_DEVICE_REVOKED', 'Доступ цього парсера відкликано.');
    await assertUserPhotoAccess(this.pool, device.user_id);
    await this.pool.query(`
      UPDATE search_horoshop_photo_parser_devices
      SET last_seen_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute')
    `, [device.id]);
    return { ...serializeDevice(device), userId: device.user_id };
  }

  async listDevices(userId) {
    const result = await this.pool.query(`
      SELECT * FROM search_horoshop_photo_parser_devices
      WHERE user_id = $1
      ORDER BY revoked_at NULLS FIRST, last_seen_at DESC NULLS LAST, paired_at DESC
    `, [userId]);
    return result.rows.map(serializeDevice);
  }

  async assertAvailableDevice(userId) {
    const result = await this.pool.query(`
      SELECT id FROM search_horoshop_photo_parser_devices
      WHERE user_id = $1 AND revoked_at IS NULL
      LIMIT 1
    `, [userId]);
    if (!result.rows[0]) {
      throw new AppError(422, 'PHOTO_DESKTOP_DEVICE_REQUIRED', 'Спочатку підключіть десктопний фото-парсер.');
    }
  }

  async revokeDevice(userId, deviceId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(`
        UPDATE search_horoshop_photo_parser_devices
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING id
      `, [deviceId, userId]);
      if (!revoked.rows[0]) throw new AppError(404, 'PHOTO_DESKTOP_DEVICE_NOT_FOUND', 'Підключений парсер не знайдено.');
      const released = await client.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'queued', device_id = NULL, lease_expires_at = NULL,
            heartbeat_at = NULL, progress = '{}'::jsonb, started_at = NULL
        WHERE executor = 'desktop' AND status = 'running' AND device_id = $1
        RETURNING draft_id
      `, [deviceId]);
      if (released.rows.length) {
        await client.query(`
          UPDATE search_horoshop_photo_drafts SET parse_status = 'queued', updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [released.rows.map((row) => row.draft_id)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recoverExpiredJobs() {
    // A previous application version could promote the photos before it marked the
    // desktop run as complete. Repair that split state before an expired lease is
    // returned to the queue, otherwise the completed draft would become queued again.
    await this.photoService.reconcileRedundantDesktopRuns();
    const client = await this.pool.connect();
    let recovered = [];
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'queued', device_id = NULL, lease_expires_at = NULL,
            heartbeat_at = NULL, progress = '{}'::jsonb, started_at = NULL
        WHERE executor = 'desktop' AND status = 'running'
          AND lease_expires_at IS NOT NULL AND lease_expires_at < NOW()
        RETURNING draft_id, batch_id
      `);
      recovered = result.rows;
      if (recovered.length) {
        await client.query(`
          UPDATE search_horoshop_photo_drafts SET parse_status = 'queued', updated_at = NOW()
          WHERE id = ANY($1::uuid[])
        `, [recovered.map((row) => row.draft_id)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const batchId of new Set(recovered.map((row) => row.batch_id))) {
      await this.photoService.refreshBatch(batchId).catch(() => {});
    }
    return recovered.length;
  }

  async materializeSelectionJobs(userId) {
    const activeSync = this.selectionSyncs.get(userId);
    if (activeSync) return activeSync;

    const sync = (async () => {
      const selections = await this.pool.query(`
        SELECT DISTINCT selection.id, selection.created_at
        FROM search_horoshop_photo_selections AS selection
        INNER JOIN search_horoshop_connections AS connection
          ON connection.id = selection.connection_id
         AND connection.generation = selection.generation
         AND connection.status = 'connected'
        INNER JOIN search_horoshop_photo_selection_items AS item
          ON item.selection_id = selection.id
        LEFT JOIN (
          SELECT batch.selection_id
          FROM search_horoshop_photo_batches AS batch
          INNER JOIN search_horoshop_photo_runs AS run ON run.batch_id = batch.id
          WHERE batch.created_by = $1 AND run.executor = 'desktop'
          GROUP BY batch.selection_id
        ) AS synced_selection ON synced_selection.selection_id = selection.id
        WHERE selection.created_by = $1
          AND synced_selection.selection_id IS NULL
        ORDER BY selection.created_at, selection.id
      `, [userId]);

      let created = 0;
      for (const selection of selections.rows) {
        try {
          await this.photoService.createBatch({
            selectionId: selection.id,
            userId,
            executor: 'desktop'
          });
          created += 1;
        } catch (error) {
          if (!['HOROSHOP_PHOTO_BATCH_EMPTY', 'HOROSHOP_PHOTO_SELECTION_NOT_FOUND'].includes(error?.code)) {
            throw error;
          }
        }
      }
      return created;
    })();

    this.selectionSyncs.set(userId, sync);
    try {
      return await sync;
    } finally {
      if (this.selectionSyncs.get(userId) === sync) this.selectionSyncs.delete(userId);
    }
  }

  async jobContext(runId, userId, db = this.pool, { forUpdate = false } = {}) {
    if (forUpdate) {
      await db.query(`
        SELECT run.id
        FROM search_horoshop_photo_runs AS run
        INNER JOIN search_horoshop_photo_batches AS batch ON batch.id = run.batch_id
        WHERE run.id = $1 AND run.executor = 'desktop' AND batch.created_by = $2
        FOR UPDATE
      `, [runId, userId]);
    }
    const result = await db.query(`
      SELECT run.*, batch.selection_id, batch.created_by AS batch_created_by,
             selection.name AS selection_name,
             draft.product_id, draft.modification_id, draft.target_type,
             draft.source_run_id, draft.media_folder_id,
             product.sku AS product_sku, product.titles AS product_titles,
             product.primary_image_url, product.canonical_url,
             modification.sku AS modification_sku, modification.titles AS modification_titles,
             modification.image_url AS modification_image_url,
             connection.store_domain
      FROM search_horoshop_photo_runs AS run
      INNER JOIN search_horoshop_photo_batches AS batch ON batch.id = run.batch_id
      INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = run.draft_id
      INNER JOIN search_horoshop_products AS product ON product.id = draft.product_id
      INNER JOIN search_horoshop_connections AS connection ON connection.id = batch.connection_id
      LEFT JOIN search_horoshop_modifications AS modification ON modification.id = draft.modification_id
      LEFT JOIN search_horoshop_photo_selections AS selection ON selection.id = batch.selection_id
      WHERE run.id = $1 AND run.executor = 'desktop' AND batch.created_by = $2
    `, [runId, userId]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'PHOTO_DESKTOP_JOB_NOT_FOUND', 'Завдання парсера не знайдено.');
    return row;
  }

  serializeJob(row) {
    const sku = row.modification_sku || row.product_sku || '';
    return {
      id: row.id,
      batchId: row.batch_id,
      selectionId: row.selection_id || null,
      selectionName: row.selection_name || 'Вибірка товарів',
      draftId: row.draft_id,
      productId: row.product_id,
      modificationId: row.modification_id || null,
      status: row.status,
      title: photoTargetTitle(
        row.modification_titles || row.product_titles,
        sku,
        localizedTitle(row.product_titles)
      ),
      sku,
      imageUrl: row.modification_image_url || row.primary_image_url || '',
      canonicalUrl: row.canonical_url || '',
      sourceUrl: row.source_url || '',
      progress: jsonObject(row.progress),
      deviceId: row.device_id || null,
      leaseExpiresAt: row.lease_expires_at || null,
      createdAt: row.created_at
    };
  }

  async listJobs(device) {
    await this.photoService.cleanupOrphanedDesktopBatches(device.userId);
    await this.recoverExpiredJobs();
    await this.materializeSelectionJobs(device.userId);
    const result = await this.pool.query(`
      SELECT run.*, batch.selection_id, selection.name AS selection_name,
             draft.product_id, draft.modification_id,
             product.sku AS product_sku, product.titles AS product_titles,
             product.primary_image_url, product.canonical_url,
             modification.sku AS modification_sku, modification.titles AS modification_titles,
             modification.image_url AS modification_image_url,
             COALESCE(uploads.uploaded_count, 0) AS uploaded_count
      FROM search_horoshop_photo_runs AS run
      INNER JOIN search_horoshop_photo_batches AS batch ON batch.id = run.batch_id
      INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = run.draft_id
      INNER JOIN search_horoshop_products AS product ON product.id = draft.product_id
      LEFT JOIN search_horoshop_modifications AS modification ON modification.id = draft.modification_id
      LEFT JOIN search_horoshop_photo_selections AS selection ON selection.id = batch.selection_id
      LEFT JOIN (
        SELECT run_id, COUNT(*)::INTEGER AS uploaded_count
        FROM search_horoshop_photo_run_uploads
        GROUP BY run_id
      ) AS uploads ON uploads.run_id = run.id
      WHERE run.executor = 'desktop' AND batch.created_by = $1
        AND (run.status = 'queued' OR (run.status = 'running' AND run.device_id = $2))
      ORDER BY batch.created_at, run.created_at, run.id
      LIMIT 1000
    `, [device.userId, device.id]);
    return result.rows.map((row) => ({ ...this.serializeJob(row), uploadedCount: Number(row.uploaded_count || 0) }));
  }

  async claimJob(device, runId) {
    await this.recoverExpiredJobs();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const run = await this.jobContext(runId, device.userId, client, { forUpdate: true });
      if (run.status === 'running' && run.device_id !== device.id) {
        throw new AppError(409, 'PHOTO_DESKTOP_JOB_CLAIMED', 'Завдання вже виконується іншим парсером.');
      }
      if (!['queued', 'running'].includes(run.status)) {
        throw new AppError(409, 'PHOTO_DESKTOP_JOB_FINISHED', 'Завдання вже завершене.');
      }
      const leaseExpiresAt = new Date(Date.now() + leaseTtlMs);
      await client.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'running', device_id = $2, lease_expires_at = $3,
            heartbeat_at = NOW(), started_at = COALESCE(started_at, NOW())
        WHERE id = $1
      `, [runId, device.id, leaseExpiresAt]);
      await client.query(`
        UPDATE search_horoshop_photo_drafts
        SET parse_status = 'running', error_message = '', error_details = '[]'::jsonb, updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id]);
      await client.query(`
        UPDATE search_horoshop_photo_batches
        SET status = 'running', started_at = COALESCE(started_at, NOW()), completed_at = NULL
        WHERE id = $1
      `, [run.batch_id]);
      await client.query('COMMIT');
      return this.serializeJob({ ...run, status: 'running', device_id: device.id, lease_expires_at: leaseExpiresAt });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async assertLeasedJob(device, runId, db = this.pool, { forUpdate = false } = {}) {
    const run = await this.jobContext(runId, device.userId, db, { forUpdate });
    if (run.status !== 'running' || run.device_id !== device.id) {
      throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Спочатку візьміть завдання в роботу.');
    }
    if (run.lease_expires_at && new Date(run.lease_expires_at).getTime() <= Date.now()) {
      throw new AppError(409, 'PHOTO_DESKTOP_JOB_LEASE_EXPIRED', 'Час виконання завдання завершився. Оновіть чергу.');
    }
    return run;
  }

  async heartbeat(device, runId, progress) {
    await this.assertLeasedJob(device, runId);
    const leaseExpiresAt = new Date(Date.now() + leaseTtlMs);
    const updated = await this.pool.query(`
      UPDATE search_horoshop_photo_runs
      SET heartbeat_at = NOW(), lease_expires_at = $2, progress = $3::jsonb
      WHERE id = $1 AND status = 'running' AND device_id = $4
        AND (lease_expires_at IS NULL OR lease_expires_at > NOW())
      RETURNING id
    `, [runId, leaseExpiresAt, JSON.stringify(progress || {}), device.id]);
    if (!updated.rows[0]) {
      throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Статус завдання змінився. Оновіть чергу.');
    }
    return { leaseExpiresAt };
  }

  async saveSource(device, runId, { sourceUrl, adapterId = '' }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const run = await this.assertLeasedJob(device, runId, client, { forUpdate: true });
      await client.query(`
        UPDATE search_horoshop_photo_runs SET source_url = $2, adapter_id = $3 WHERE id = $1
      `, [runId, sourceUrl, adapterId]);
      await client.query(`
        UPDATE search_horoshop_photo_drafts
        SET source_url = $2, adapter_id = $3, publish_status = 'draft', updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id, sourceUrl, adapterId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return { sourceUrl, adapterId };
  }

  async ensureTargetFolder(run) {
    if (run.media_folder_id) return { id: run.media_folder_id };
    const rootName = `Фото Хорошоп — ${run.store_domain}`.slice(0, 120);
    const rootKey = `root:${run.batch_created_by}:${rootName.toLocaleLowerCase('uk-UA')}`;
    const rootFolder = await this.ensureFolderOnce(rootKey, () => ensureMediaFolder({
      name: rootName,
      userId: run.batch_created_by
    }, { query: (...args) => this.pool.query(...args) }));
    const targetName = `${run.product_sku || 'Товар'} ${localizedTitle(run.product_titles)}`.trim().slice(0, 120);
    const targetKey = `target:${rootFolder.id}:${targetName.toLocaleLowerCase('uk-UA')}`;
    return this.ensureFolderOnce(targetKey, () => ensureMediaFolder({
      name: targetName,
      parentId: rootFolder.id,
      userId: run.batch_created_by
    }, { query: (...args) => this.pool.query(...args) }));
  }

  async ensureFolderOnce(key, factory) {
    const existing = this.targetFolderSyncs.get(key);
    if (existing) return existing;
    const pending = Promise.resolve().then(factory);
    this.targetFolderSyncs.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.targetFolderSyncs.get(key) === pending) this.targetFolderSyncs.delete(key);
    }
  }

  async removeMediaAsset(assetId) {
    const result = await this.pool.query(`
      DELETE FROM media_library_assets WHERE id = $1 RETURNING storage_key
    `, [assetId]);
    if (result.rows[0]?.storage_key) await removeMediaImage(result.rows[0].storage_key).catch(() => {});
  }

  async uploadAsset(device, runId, { buffer, sourceUrl, sortOrder, originalName }) {
    const run = await this.assertLeasedJob(device, runId);
    if (sortOrder < 0 || sortOrder >= 40) {
      throw new AppError(422, 'PHOTO_DESKTOP_SORT_ORDER_INVALID', 'Некоректний порядок фотографії.');
    }
    const converted = await convertPhotoParserImageToWebp(buffer);
    const existing = await this.pool.query(`
      SELECT upload.*, asset.url, asset.width, asset.height, asset.size_bytes
      FROM search_horoshop_photo_run_uploads AS upload
      INNER JOIN media_library_assets AS asset ON asset.id = upload.media_asset_id
      WHERE upload.run_id = $1 AND (upload.source_url = $2 OR upload.content_sha256 = $3)
      LIMIT 1
    `, [runId, sourceUrl, converted.contentSha256]);
    if (existing.rows[0]) {
      const row = existing.rows[0];
      return {
        id: row.id,
        sourceUrl: row.source_url,
        sortOrder: row.sort_order,
        url: row.url,
        width: Number(row.width || 0),
        height: Number(row.height || 0),
        size: Number(row.size_bytes || 0)
      };
    }
    const folder = await this.ensureTargetFolder(run);
    const asset = await this.createAsset({
      buffer: converted.buffer,
      originalName: originalName || `${run.modification_sku || run.product_sku || 'photo'}-${sortOrder + 1}.webp`,
      folderId: folder.id,
      userId: run.batch_created_by,
      prepared: {
        width: converted.width,
        height: converted.height,
        contentSha256: converted.contentSha256
      }
    }, { query: (...args) => this.pool.query(...args) });
    const client = await this.pool.connect();
    let duplicate = null;
    let insertedId = '';
    let replacedStorageKey = '';
    try {
      await client.query('BEGIN');
      const lockedRun = await this.assertLeasedJob(device, runId, client, { forUpdate: true });
      const current = await client.query(`
        SELECT upload.*, media.url, media.width, media.height, media.size_bytes
        FROM search_horoshop_photo_run_uploads AS upload
        INNER JOIN media_library_assets AS media ON media.id = upload.media_asset_id
        WHERE upload.run_id = $1 AND (upload.source_url = $2 OR upload.content_sha256 = $3)
        LIMIT 1
      `, [runId, sourceUrl, converted.contentSha256]);
      if (current.rows[0]) {
        duplicate = current.rows[0];
      } else {
        const conflicting = await client.query(`
          SELECT upload.id, upload.media_asset_id, media.storage_key
          FROM search_horoshop_photo_run_uploads AS upload
          INNER JOIN media_library_assets AS media ON media.id = upload.media_asset_id
          WHERE upload.run_id = $1 AND upload.sort_order = $2
          FOR UPDATE
        `, [runId, sortOrder]);
        if (conflicting.rows[0]) {
          const conflict = conflicting.rows[0];
          const promoted = await client.query(`
            SELECT id FROM search_horoshop_photo_assets WHERE media_asset_id = $1 LIMIT 1
          `, [conflict.media_asset_id]);
          await client.query('DELETE FROM search_horoshop_photo_run_uploads WHERE id = $1', [conflict.id]);
          if (!promoted.rows[0]) {
            await client.query('DELETE FROM media_library_assets WHERE id = $1', [conflict.media_asset_id]);
            replacedStorageKey = conflict.storage_key;
          }
        }
        const inserted = await client.query(`
          INSERT INTO search_horoshop_photo_run_uploads (
            run_id, media_asset_id, source_url, content_sha256, sort_order
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [runId, asset.id, sourceUrl, converted.contentSha256, sortOrder]);
        insertedId = inserted.rows[0].id;
        await client.query(`
          UPDATE search_horoshop_photo_drafts SET media_folder_id = $2, updated_at = NOW()
          WHERE id = $1
        `, [lockedRun.draft_id, folder.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      await this.removeMediaAsset(asset.id).catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (duplicate) {
      await this.removeMediaAsset(asset.id).catch(() => {});
      return {
        id: duplicate.id,
        sourceUrl: duplicate.source_url,
        sortOrder: duplicate.sort_order,
        url: duplicate.url,
        width: Number(duplicate.width || 0),
        height: Number(duplicate.height || 0),
        size: Number(duplicate.size_bytes || 0)
      };
    }
    if (replacedStorageKey) await removeMediaImage(replacedStorageKey).catch(() => {});
    return { id: insertedId, sourceUrl, sortOrder, ...asset };
  }

  async deleteUploadAssets(runId, db) {
    const result = await db.query(`
      SELECT upload.media_asset_id, asset.storage_key
      FROM search_horoshop_photo_run_uploads AS upload
      INNER JOIN media_library_assets AS asset ON asset.id = upload.media_asset_id
      WHERE upload.run_id = $1
      FOR UPDATE
    `, [runId]);
    if (!result.rows.length) return [];
    const mediaIds = result.rows.map((row) => row.media_asset_id);
    const promoted = await db.query(`
      SELECT DISTINCT media_asset_id
      FROM search_horoshop_photo_assets
      WHERE media_asset_id IN (${mediaIds.map((_, index) => `$${index + 1}`).join(', ')})
    `, mediaIds);
    const promotedIds = new Set(promoted.rows.map((row) => row.media_asset_id));
    await db.query('DELETE FROM search_horoshop_photo_run_uploads WHERE run_id = $1', [runId]);
    const obsolete = result.rows.filter((row) => !promotedIds.has(row.media_asset_id));
    if (obsolete.length) {
      const obsoleteMediaIds = obsolete.map((row) => row.media_asset_id);
      await db.query(`
        DELETE FROM media_library_assets
        WHERE id IN (${obsoleteMediaIds.map((_, index) => `$${index + 1}`).join(', ')})
      `, obsoleteMediaIds);
    }
    return obsolete;
  }

  async completeJob(device, runId, { sourceUrl, adapterId = '', foundCount = 0, errors = [] }) {
    const client = await this.pool.connect();
    let run;
    let replacedAssets = [];
    let redundantUploads = [];
    let result;
    try {
      await client.query('BEGIN');
      run = await this.jobContext(runId, device.userId, client, { forUpdate: true });
      if (run.status === 'success' || run.status === 'partial') {
        redundantUploads = await this.deleteUploadAssets(runId, client);
        const saved = await client.query(`
          SELECT COUNT(*)::INTEGER AS count
          FROM search_horoshop_photo_assets
          WHERE draft_id = $1
        `, [run.draft_id]);
        if (Number(saved.rows[0]?.count || 0) > 0) {
          await client.query(`
            UPDATE search_horoshop_photo_drafts
            SET source_run_id = $2, parse_status = $3, updated_at = NOW()
            WHERE id = $1 AND (source_run_id IS NULL OR source_run_id = $2)
          `, [run.draft_id, run.id, run.status === 'partial' ? 'partial' : 'ready']);
        }
        result = {
          status: run.status,
          foundCount: Number(run.found_count || 0),
          savedCount: Number(run.saved_count || 0),
          errors: jsonArray(run.error_details)
        };
        await client.query('COMMIT');
      } else {
        if (run.status !== 'running' || run.device_id !== device.id) {
          throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Спочатку візьміть завдання в роботу.');
        }
        if (run.lease_expires_at && new Date(run.lease_expires_at).getTime() <= Date.now()) {
          throw new AppError(409, 'PHOTO_DESKTOP_JOB_LEASE_EXPIRED', 'Час виконання завдання завершився. Оновіть чергу.');
        }
        const uploaded = await client.query(`
          SELECT upload.*, asset.id AS asset_id, asset.url, asset.width, asset.height, asset.size_bytes
          FROM search_horoshop_photo_run_uploads AS upload
          INNER JOIN media_library_assets AS asset ON asset.id = upload.media_asset_id
          WHERE upload.run_id = $1
          ORDER BY upload.sort_order, upload.created_at
          FOR UPDATE
        `, [runId]);
        if (!uploaded.rows.length) {
          throw new AppError(422, 'PHOTO_DESKTOP_UPLOAD_EMPTY', 'Оберіть і завантажте хоча б одну фотографію.');
        }
        const prepared = uploaded.rows.map((row) => ({
          sourceUrl: row.source_url,
          contentSha256: row.content_sha256,
          asset: { id: row.asset_id }
        }));
        const savedCount = prepared.length;
        const normalizedFound = Math.max(savedCount, Number(foundCount || 0));
        const normalizedErrors = Array.isArray(errors) ? errors.slice(0, 40) : [];
        const status = normalizedErrors.length ? 'partial' : 'success';
        const draftStatus = normalizedErrors.length ? 'partial' : 'ready';
        const message = normalizedErrors.length ? `Частину фотографій пропущено: ${normalizedErrors.length}` : '';

        replacedAssets = await this.photoService.replaceDraftAssets(run, prepared, { db: client });
        await client.query('DELETE FROM search_horoshop_photo_run_uploads WHERE run_id = $1', [runId]);
        const finalized = await client.query(`
          UPDATE search_horoshop_photo_runs
          SET status = $2, source_url = $3, adapter_id = $4, found_count = $5,
              saved_count = $6, skipped_count = $7, error_message = $8,
              error_details = $9::jsonb, progress = '{"phase":"complete","percentage":100}'::jsonb,
              device_id = NULL, lease_expires_at = NULL, heartbeat_at = NOW(), completed_at = NOW()
          WHERE id = $1 AND status = 'running' AND device_id = $10
          RETURNING id
        `, [
          runId, status, sourceUrl, adapterId, normalizedFound, savedCount,
          Math.max(0, normalizedFound - savedCount), message, JSON.stringify(normalizedErrors), device.id
        ]);
        if (!finalized.rows[0]) {
          throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Статус завдання змінився. Оновіть чергу.');
        }
        await client.query(`
          UPDATE search_horoshop_photo_drafts
          SET source_url = $2, adapter_id = $3, parse_status = $4, publish_status = 'draft',
              found_count = $5, error_message = $6, error_details = $7::jsonb,
              source_run_id = $8, updated_at = NOW()
          WHERE id = $1
        `, [
          run.draft_id, sourceUrl, adapterId, draftStatus, normalizedFound,
          message, JSON.stringify(normalizedErrors), runId
        ]);
        await client.query('COMMIT');
        result = { status, foundCount: normalizedFound, savedCount, errors: normalizedErrors };
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const asset of replacedAssets) await removeMediaImage(asset.storage_key).catch(() => {});
    for (const asset of redundantUploads) await removeMediaImage(asset.storage_key).catch(() => {});
    await this.photoService.refreshBatch(run.batch_id).catch((error) => {
      console.error('Photo desktop batch refresh failed after completing a job', {
        batchId: run.batch_id,
        runId,
        error
      });
    });
    return result;
  }

  async failJob(device, runId, { message, errors = [] }) {
    const safeMessage = cleanError({ message });
    const client = await this.pool.connect();
    let run;
    let uploads = [];
    try {
      await client.query('BEGIN');
      run = await this.assertLeasedJob(device, runId, client, { forUpdate: true });
      const details = Array.isArray(errors) && errors.length
        ? errors.slice(0, 40)
        : [{ stage: 'desktop', sourceUrl: run.source_url || '', message: safeMessage }];
      uploads = await this.deleteUploadAssets(runId, client);
      const failed = await client.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'failed', error_message = $2, error_details = $3::jsonb,
            device_id = NULL, lease_expires_at = NULL, heartbeat_at = NOW(), completed_at = NOW()
        WHERE id = $1 AND status = 'running' AND device_id = $4
        RETURNING id
      `, [runId, safeMessage, JSON.stringify(details), device.id]);
      if (!failed.rows[0]) throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Статус завдання змінився. Оновіть чергу.');
      await client.query(`
        UPDATE search_horoshop_photo_drafts
        SET parse_status = 'failed', error_message = $2, error_details = $3::jsonb, updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id, safeMessage, JSON.stringify(details)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const asset of uploads) await removeMediaImage(asset.storage_key).catch(() => {});
    await this.photoService.refreshBatch(run.batch_id).catch(() => {});
    return { status: 'failed', errorMessage: safeMessage };
  }

  async releaseJob(device, runId) {
    const client = await this.pool.connect();
    let run;
    let uploads = [];
    try {
      await client.query('BEGIN');
      run = await this.assertLeasedJob(device, runId, client, { forUpdate: true });
      uploads = await this.deleteUploadAssets(runId, client);
      const released = await client.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'queued', device_id = NULL, lease_expires_at = NULL,
            heartbeat_at = NULL, progress = '{}'::jsonb, started_at = NULL
        WHERE id = $1 AND status = 'running' AND device_id = $2
        RETURNING id
      `, [runId, device.id]);
      if (!released.rows[0]) throw new AppError(409, 'PHOTO_DESKTOP_JOB_NOT_CLAIMED', 'Статус завдання змінився. Оновіть чергу.');
      await client.query(`
        UPDATE search_horoshop_photo_drafts SET parse_status = 'queued', updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const asset of uploads) await removeMediaImage(asset.storage_key).catch(() => {});
    await this.photoService.refreshBatch(run.batch_id).catch(() => {});
    return { status: 'queued' };
  }
}

export const horoshopPhotoDesktopService = new HoroshopPhotoDesktopService();
