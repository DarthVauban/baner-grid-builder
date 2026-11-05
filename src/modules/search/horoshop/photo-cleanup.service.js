import { removeMediaImage } from '../../media/media.storage.js';
import { absoluteMediaUrl } from './photo-publication.js';
import { readRemotePhotoTargets, verifyPhotoTransfer } from './photo-verification.js';

const retainedMessage = 'Перевірка передачі не завершена. Фото залишено у сховищі.';

function target(row) {
  return { id: row.id, article: row.article, parentArticle: row.parent_article, targetType: row.target_type };
}

export function serializePhotoPublication(row) {
  return {
    id: row.id,
    article: row.article,
    targetType: row.target_type,
    mode: row.mode,
    outcome: row.outcome,
    photoCount: row.assets.filter((asset) => asset.selected).length,
    verificationStatus: row.verification_status,
    cleanupStatus: row.cleanup_status,
    retainedCount: Number(row.retained_count),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    verifiedAt: row.verified_at,
    cleanedAt: row.cleaned_at
  };
}

export class HoroshopPhotoCleanupService {
  constructor({ pool, deleteEmptyMediaFolders, removeImage = removeMediaImage }) {
    this.pool = pool;
    this.deleteEmptyMediaFolders = deleteEmptyMediaFolders;
    this.removeImage = removeImage;
  }

  async history(storeDomain) {
    const result = await this.pool.query(`
      SELECT * FROM search_horoshop_photo_publications
      WHERE store_domain = $1 ORDER BY created_at DESC, id DESC LIMIT 50
    `, [storeDomain]);
    return result.rows.map(serializePhotoPublication);
  }

  async begin({ connection, drafts, mode, publicOrigin, client, token, userId }) {
    let before = null;
    try { before = await readRemotePhotoTargets(client, token, drafts, connection.store_domain); }
    catch { /* Import can proceed, but an unavailable baseline never permits deletion. */ }
    const publications = [];
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      for (const draft of drafts) {
        const snapshot = await db.query(`
          SELECT photo.id, photo.media_asset_id, photo.source_url, photo.selected, photo.sort_order,
                 asset.url, asset.storage_key, asset.folder_id, asset.content_sha256
          FROM search_horoshop_photo_assets AS photo
          INNER JOIN media_library_assets AS asset ON asset.id = photo.media_asset_id
          WHERE photo.draft_id = $1 ORDER BY photo.sort_order, photo.id
        `, [draft.id]);
        const assets = snapshot.rows.map((asset) => ({
          ...asset, url: absoluteMediaUrl(publicOrigin, asset.url)
        }));
        const result = await db.query(`
          INSERT INTO search_horoshop_photo_publications (
            connection_id, generation, draft_id, store_domain, article, parent_article,
            public_origin, target_type, mode, assets, before_images, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
          RETURNING *
        `, [connection.id, connection.generation, draft.id, connection.store_domain,
          draft.article, draft.parentArticle, publicOrigin, draft.targetType, mode,
          JSON.stringify(assets), before ? JSON.stringify(before.get(draft.id)) : null, userId]);
        publications.push(result.rows[0]);
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
    return publications;
  }

  async published(publications, userId) {
    const db = await this.pool.connect();
    const publishedAt = new Date();
    try {
      await db.query('BEGIN');
      for (const row of publications) {
        await db.query(`
          UPDATE search_horoshop_photo_drafts
          SET publish_status = 'published', published_at = $3, published_by = $2,
              error_message = '', updated_at = NOW() WHERE id = $1
        `, [row.draft_id, userId, publishedAt]);
        const updated = await db.query(`
          UPDATE search_horoshop_photo_publications
          SET outcome = 'published', published_at = $2 WHERE id = $1 RETURNING *
        `, [row.id, publishedAt]);
        Object.assign(row, updated.rows[0]);
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  }

  async failed(publications, message) {
    for (const row of publications) await this.pool.query(`
      UPDATE search_horoshop_photo_publications
      SET outcome = 'failed', verification_status = 'unconfirmed', cleanup_status = 'retained',
          error_message = $2, retained_count = $3 WHERE id = $1 AND outcome = 'publishing'
    `, [row.id, message, row.assets.length]);
  }

  async retain(row) {
    await this.pool.query(`
      UPDATE search_horoshop_photo_publications
      SET verification_attempts = verification_attempts + 1,
          verification_status = $2, cleanup_status = $3,
          next_check_at = $4, error_message = $5
      WHERE id = $1 AND verification_status = 'pending'
    `, [row.id, !row.before_images || row.verification_attempts >= 4 ? 'unconfirmed' : 'pending',
      !row.before_images || row.verification_attempts >= 4 ? 'retained' : 'pending',
      new Date(Date.now() + 60_000), retainedMessage]);
  }

  async verify(publications, client, token) {
    if (!publications.length) return;
    let remote;
    try {
      remote = await readRemotePhotoTargets(client, token, publications.map(target), publications[0].store_domain);
    } catch {
      for (const row of publications) await this.retain(row);
      return;
    }
    for (const row of publications) {
      const after = remote.get(row.id);
      try {
        verifyPhotoTransfer({ before: row.before_images, after,
          submitted: row.assets.filter((asset) => asset.selected).map((asset) => asset.url),
          mode: row.mode, publicOrigin: row.public_origin });
        await client.verifyPhotoFiles(after.filter((url) => !row.before_images.includes(url)));
      } catch { await this.retain(row); continue; }
      try { await this.cleanup(row, after); }
      catch {
        await this.pool.query(`
          UPDATE search_horoshop_photo_publications SET next_check_at = $2, error_message = $3
          WHERE id = $1 AND verification_status = 'pending'
        `, [row.id, new Date(Date.now() + 60_000), 'Не вдалося завершити очищення. Повторимо автоматично; фото збережено.']);
      }
    }
    await this.flushFiles();
  }

  async cleanup(publication, after) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const locked = await db.query(`
        SELECT * FROM search_horoshop_photo_publications WHERE id = $1 FOR UPDATE
      `, [publication.id]);
      const row = locked.rows[0];
      if (row?.outcome !== 'published' || row.verification_status !== 'pending') {
        await db.query('COMMIT');
        return;
      }
      const draft = (await db.query(`
        SELECT id, publish_status, parse_status, published_at, media_folder_id
        FROM search_horoshop_photo_drafts WHERE id = $1 FOR UPDATE
      `, [row.draft_id])).rows[0];
      // A new parse or publication may have replaced this draft since verification.
      const unchanged = draft?.publish_status === 'published'
        && !['queued', 'running'].includes(draft.parse_status)
        && new Date(draft.published_at).getTime() === new Date(row.published_at).getTime();
      let retained = row.assets.length;
      if (unchanged) {
        const current = await db.query(`
          SELECT photo.id, photo.media_asset_id, asset.storage_key, asset.folder_id, asset.content_sha256
          FROM search_horoshop_photo_assets AS photo
          INNER JOIN media_library_assets AS asset ON asset.id = photo.media_asset_id
          WHERE photo.draft_id = $1
        `, [row.draft_id]);
        const snapshot = new Map(row.assets.map((asset) => [asset.id, asset]));
        const candidates = current.rows.filter((asset) => {
          const expected = snapshot.get(asset.id);
          return expected?.media_asset_id === asset.media_asset_id && expected.storage_key === asset.storage_key
            && expected.folder_id === asset.folder_id && expected.content_sha256 === asset.content_sha256;
        });
        retained = current.rows.filter((asset) => snapshot.has(asset.id) && !candidates.includes(asset)).length;
        for (const asset of candidates) {
          const lockedAsset = (await db.query(`
            SELECT id, storage_key, folder_id, content_sha256 FROM media_library_assets WHERE id = $1 FOR UPDATE
          `, [asset.media_asset_id])).rows[0];
          if (!lockedAsset || lockedAsset.storage_key !== asset.storage_key
            || lockedAsset.folder_id !== asset.folder_id || lockedAsset.content_sha256 !== asset.content_sha256) {
            retained += 1;
            continue;
          }
          const otherDrafts = await db.query(`
            SELECT id FROM search_horoshop_photo_assets WHERE media_asset_id = $1 AND draft_id <> $2 LIMIT 1
          `, [asset.media_asset_id, row.draft_id]);
          const otherRuns = await db.query(`
            SELECT upload.id FROM search_horoshop_photo_run_uploads AS upload
            INNER JOIN search_horoshop_photo_runs AS run ON run.id = upload.run_id
            WHERE upload.media_asset_id = $1
              AND (run.draft_id <> $2 OR run.status IN ('queued', 'running')) LIMIT 1
          `, [asset.media_asset_id, row.draft_id]);
          if (otherDrafts.rows.length || otherRuns.rows.length) { retained += 1; continue; }
          await db.query(`
            INSERT INTO search_horoshop_photo_cleanup_files (publication_id, media_asset_id, storage_key)
            VALUES ($1, $2, $3) ON CONFLICT (publication_id, media_asset_id) DO NOTHING
          `, [row.id, asset.media_asset_id, asset.storage_key]);
          await db.query('DELETE FROM media_library_assets WHERE id = $1', [asset.media_asset_id]);
        }
        const remaining = await db.query('SELECT id FROM search_horoshop_photo_assets WHERE draft_id = $1 LIMIT 1', [row.draft_id]);
        if (!remaining.rows.length) {
          await db.query('UPDATE search_horoshop_photo_drafts SET media_folder_id = NULL WHERE id = $1', [row.draft_id]);
          const parents = await this.deleteEmptyMediaFolders(db, [draft.media_folder_id, ...candidates.map((asset) => asset.folder_id)]);
          await this.deleteEmptyMediaFolders(db, parents);
        }
      }
      await db.query(`
        UPDATE search_horoshop_photo_publications
        SET verification_status = 'verified', verified_at = NOW(), remote_images = $2::jsonb,
            retained_count = $3, error_message = '' WHERE id = $1
      `, [row.id, JSON.stringify(after), retained]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  }

  async flushFiles() {
    const pending = await this.pool.query(`
      SELECT * FROM search_horoshop_photo_cleanup_files WHERE removed_at IS NULL LIMIT 200
    `);
    for (const file of pending.rows) {
      try {
        await this.removeImage(file.storage_key);
        await this.pool.query('UPDATE search_horoshop_photo_cleanup_files SET removed_at = NOW() WHERE id = $1', [file.id]);
      } catch { /* Keep the durable entry for the next worker tick, including after restart. */ }
    }
    await this.pool.query(`
      UPDATE search_horoshop_photo_publications
      SET cleanup_status = CASE WHEN retained_count > 0 THEN 'retained' ELSE 'completed' END, cleaned_at = NOW()
      WHERE verification_status = 'verified' AND cleanup_status = 'pending'
        AND id NOT IN (
          SELECT publication_id FROM search_horoshop_photo_cleanup_files WHERE removed_at IS NULL
        )
    `);
  }

  async pending(connection) {
    return (await this.pool.query(`
      SELECT * FROM search_horoshop_photo_publications
      WHERE connection_id = $1 AND generation = $2 AND outcome = 'published'
        AND verification_status = 'pending' AND next_check_at <= NOW()
      ORDER BY created_at LIMIT 5
    `, [connection.id, connection.generation])).rows;
  }
}
