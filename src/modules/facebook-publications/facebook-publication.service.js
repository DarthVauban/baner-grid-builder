import { createHash } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

export const facebookPublicationToolId = 'facebook_group_publications';

export function normalizeFacebookPublicationText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function facebookPublicationStoreIdentity(city) {
  const normalizedCity = normalizeFacebookPublicationText(city);
  const digest = createHash('sha256').update(normalizedCity).digest('hex').slice(0, 20);
  return {
    code: `CITY-${digest}`,
    normalizedCode: `city:${digest}`
  };
}

export function normalizeFacebookGroupUrl(value) {
  const source = String(value ?? '').trim();
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new AppError(422, 'FACEBOOK_GROUP_URL_INVALID', 'Вкажіть коректне посилання на Facebook-групу.');
  }
  const host = parsed.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
  if (parsed.protocol !== 'https:' || (host !== 'facebook.com' && !host.endsWith('.facebook.com'))) {
    throw new AppError(422, 'FACEBOOK_GROUP_URL_INVALID', 'Посилання має вести на Facebook через HTTPS.');
  }
  if (!parsed.pathname.toLocaleLowerCase('en-US').startsWith('/groups/')) {
    throw new AppError(422, 'FACEBOOK_GROUP_URL_INVALID', 'Посилання має вести безпосередньо на Facebook-групу.');
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.hostname = 'www.facebook.com';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

export function renderFacebookPublicationText(template, values) {
  const replacements = {
    city: values.city || '',
    address: values.address || '',
    promotion: values.promotion || ''
  };
  return String(template || '')
    .replace(/{{\s*(city|address|promotion)\s*}}/gi, (_, key) => replacements[key.toLowerCase()])
    .replace(/\[місто\]/giu, replacements.city)
    .replace(/\[адреса\]/giu, replacements.address)
    .replace(/\[акція\]/giu, replacements.promotion)
    .trim();
}

export function serializeFacebookPublicationStore(row) {
  return {
    id: row.id,
    city: row.city,
    address: row.address,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeFacebookPublicationGroup(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    advertisingPolicy: row.advertising_policy,
    moderationRequired: row.moderation_required === true,
    recommendedIntervalDays: Number(row.recommended_interval_days || 0),
    status: row.status,
    lastPublishedAt: row.last_published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeFacebookPublicationAsset(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    url: `/api/facebook-publications/assets/${row.id}`,
    createdAt: row.created_at
  };
}

export function serializeFacebookPublicationTarget(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    groupId: row.group_id,
    storeId: row.store_id,
    groupName: row.group_name,
    groupUrl: row.group_url,
    city: row.city,
    storeName: row.store_name,
    address: row.address,
    renderedText: row.rendered_text,
    textVariantIndex: Number(row.text_variant_index || 0),
    assetId: row.asset_id || null,
    imageUrl: row.asset_id ? `/api/facebook-publications/assets/${row.asset_id}` : '',
    status: row.status,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    retryOfTargetId: row.retry_of_target_id || null,
    postUrl: row.post_url || '',
    note: row.note || '',
    openedAt: row.opened_at || null,
    copiedAt: row.copied_at || null,
    imageOpenedAt: row.image_opened_at || null,
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name ? { id: row.updated_by, name: row.updated_by_name } : null
  };
}

export function serializeFacebookPublicationCampaign(row, targets) {
  const counts = targets
    ? targets.reduce((result, target) => {
      result.total += 1;
      result[target.status] = (result[target.status] || 0) + 1;
      return result;
    }, { total: 0, not_started: 0, published: 0, pending_moderation: 0, rejected: 0, skipped: 0 })
    : {
      total: Number(row.target_count || 0),
      not_started: Number(row.not_started_count || 0),
      published: Number(row.published_count || 0),
      pending_moderation: Number(row.pending_moderation_count || 0),
      rejected: Number(row.rejected_count || 0),
      skipped: Number(row.skipped_count || 0)
    };
  return {
    id: row.id,
    title: row.title,
    promotion: row.promotion || '',
    plannedDate: String(row.planned_date).slice(0, 10),
    textVariants: Array.isArray(row.text_variants) ? row.text_variants : [],
    asset: row.asset_id ? serializeFacebookPublicationAsset({
      id: row.asset_id,
      file_name: row.asset_file_name,
      mime_type: row.asset_mime_type,
      size_bytes: row.asset_size_bytes,
      created_at: row.asset_created_at
    }) : null,
    status: row.status,
    counts,
    targets: targets?.map(serializeFacebookPublicationTarget),
    createdBy: row.created_by_name ? { id: row.created_by, name: row.created_by_name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function lookupRow(raw) {
  return new Map(Object.entries(raw || {}).map(([key, value]) => [normalizeFacebookPublicationText(key), value]));
}

function firstValue(lookup, aliases) {
  for (const alias of aliases) {
    const value = lookup.get(normalizeFacebookPublicationText(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function parseBoolean(value) {
  return ['так', 'yes', 'true', '1', '+'].includes(normalizeFacebookPublicationText(value));
}

function parseGroupStatus(value) {
  const normalized = normalizeFacebookPublicationText(value);
  if (['не публікувати', 'do not publish', 'do_not_publish', 'заблокована'].includes(normalized)) return 'do_not_publish';
  if (['неактивна', 'неактивний', 'inactive'].includes(normalized)) return 'inactive';
  return 'active';
}

function parseAdvertisingPolicy(value) {
  const normalized = normalizeFacebookPublicationText(value);
  if (['дозволена', 'дозволено', 'allowed', 'так', 'yes'].includes(normalized)) return 'allowed';
  if (['заборонена', 'заборонено', 'forbidden', 'ні', 'no'].includes(normalized)) return 'forbidden';
  return 'unknown';
}

function importSummary(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.action] += 1;
    return summary;
  }, { total: 0, create: 0, update: 0, error: 0, conflict: 0 });
}

export async function analyzeFacebookPublicationImport({ stores: rawStores, groups: rawGroups }, db = { query }) {
  const existingStores = await db.query('SELECT * FROM facebook_publication_stores ORDER BY created_at');
  const existingGroups = await db.query('SELECT * FROM facebook_publication_groups ORDER BY created_at');
  const storesByCity = new Map(existingStores.rows.map((store) => [normalizeFacebookPublicationText(store.city), store]));
  const groupsByUrl = new Map(existingGroups.rows.map((group) => [group.normalized_url, group]));
  const seenStores = new Map();
  const seenGroups = new Map();

  const stores = (Array.isArray(rawStores) ? rawStores : []).map((raw, index) => {
    const lookup = lookupRow(raw);
    const city = String(firstValue(lookup, ['Місто', 'City'])).trim().slice(0, 120);
    const normalizedCity = normalizeFacebookPublicationText(city);
    const existing = storesByCity.get(normalizedCity);
    const row = {
      rowNumber: index + 2,
      city,
      address: String(firstValue(lookup, ['Адреса', 'Address'])).trim().slice(0, 500),
      normalizedCity,
      storeId: existing?.id || null,
      action: existing ? 'update' : 'create',
      reason: ''
    };
    if (!row.city || !row.address) {
      row.action = 'error';
      row.reason = 'Місто та адреса є обовʼязковими.';
    } else if (seenStores.has(normalizedCity)) {
      row.action = 'conflict';
      row.reason = `Дублікат міста в рядку ${seenStores.get(normalizedCity)}.`;
    } else {
      seenStores.set(normalizedCity, row.rowNumber);
    }
    return row;
  });

  const groups = (Array.isArray(rawGroups) ? rawGroups : []).map((raw, index) => {
    const lookup = lookupRow(raw);
    let normalizedUrl = '';
    let urlError = '';
    try {
      normalizedUrl = normalizeFacebookGroupUrl(firstValue(lookup, ['Посилання', 'URL', 'Group URL']));
    } catch (error) {
      urlError = error instanceof Error ? error.message : 'Некоректне посилання.';
    }
    const existing = groupsByUrl.get(normalizedUrl);
    const advertisingAllowed = parseBoolean(firstValue(lookup, ['Реклама дозволена', 'Advertising allowed']));
    const advertisingForbidden = parseBoolean(firstValue(lookup, ['Реклама заборонена', 'Advertising forbidden']));
    const inactive = parseBoolean(firstValue(lookup, ['Неактивна', 'Inactive']));
    const doNotPublish = parseBoolean(firstValue(lookup, ['Не публікувати', 'Do not publish']));
    const row = {
      rowNumber: index + 2,
      name: String(firstValue(lookup, ['Назва групи', 'Назва', 'Group name'])).trim().slice(0, 300),
      url: normalizedUrl,
      normalizedUrl,
      advertisingPolicy: advertisingForbidden
        ? 'forbidden'
        : advertisingAllowed
          ? 'allowed'
          : parseAdvertisingPolicy(firstValue(lookup, ['Реклама', 'Advertising'])),
      moderationRequired: parseBoolean(firstValue(lookup, ['Модерація', 'Moderation'])),
      status: doNotPublish
        ? 'do_not_publish'
        : inactive
          ? 'inactive'
          : parseGroupStatus(firstValue(lookup, ['Статус', 'Status'])),
      groupId: existing?.id || null,
      action: 'create',
      reason: ''
    };
    if (!row.name || !normalizedUrl) {
      row.action = 'error';
      row.reason = urlError || 'Назва та URL групи є обовʼязковими.';
    } else if (advertisingAllowed && advertisingForbidden) {
      row.action = 'error';
      row.reason = 'Не можна одночасно дозволити й заборонити рекламу.';
    } else if (inactive && doNotPublish) {
      row.action = 'error';
      row.reason = 'Оберіть лише одну позначку: «Неактивна» або «Не публікувати».';
    } else if (seenGroups.has(normalizedUrl)) {
      row.action = 'conflict';
      row.reason = `Дублікат посилання на групу в рядку ${seenGroups.get(normalizedUrl)}.`;
    } else {
      seenGroups.set(normalizedUrl, row.rowNumber);
      if (existing) {
        row.action = 'conflict';
        row.reason = 'Група з таким посиланням уже є в довіднику.';
      }
    }
    return row;
  });

  return {
    stores: { rows: stores, summary: importSummary(stores) },
    groups: { rows: groups, summary: importSummary(groups) }
  };
}

export async function commitFacebookPublicationImport(payload, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const preview = await analyzeFacebookPublicationImport(payload, client);
    const result = { stores: { created: 0, updated: 0, errors: 0 }, groups: { created: 0, updated: 0, errors: 0 } };
    for (const row of preview.stores.rows) {
      if (!['create', 'update'].includes(row.action)) {
        result.stores.errors += 1;
        continue;
      }
      if (row.storeId) {
        await client.query(
          `UPDATE facebook_publication_stores
           SET name = $2, city = $2, address = $3, notes = '', status = 'active', updated_at = NOW()
           WHERE id = $1`,
          [row.storeId, row.city, row.address]
        );
      } else {
        const identity = facebookPublicationStoreIdentity(row.city);
        await client.query(
          `INSERT INTO facebook_publication_stores (
             code, normalized_code, name, city, address, notes, status, created_by
           ) VALUES ($1, $2, $3, $3, $4, '', 'active', $5)
           ON CONFLICT (normalized_code) DO UPDATE
           SET name = EXCLUDED.name, city = EXCLUDED.city, address = EXCLUDED.address,
               notes = '', status = 'active', updated_at = NOW()`,
          [identity.code, identity.normalizedCode, row.city, row.address, userId]
        );
      }
      result.stores[row.action === 'create' ? 'created' : 'updated'] += 1;
    }
    for (const row of preview.groups.rows) {
      if (row.action !== 'create') {
        result.groups.errors += 1;
        continue;
      }
      const inserted = await client.query(
        `INSERT INTO facebook_publication_groups (
           name, url, normalized_url, city, default_store_id, notes,
           advertising_policy, moderation_required, recommended_interval_days, status, created_by
         ) VALUES ($1, $2, $3, '', NULL, '', $4, $5, 14, $6, $7)
         ON CONFLICT (normalized_url) DO NOTHING
         RETURNING id`,
        [row.name, row.url, row.normalizedUrl, row.advertisingPolicy,
          row.moderationRequired, row.status, userId]
      );
      if (inserted.rowCount) result.groups.created += 1;
      else result.groups.errors += 1;
    }
    await client.query('COMMIT');
    return { ...result, preview };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function publicationWarnings(group, lastPublishedAt, plannedDate) {
  const warnings = [];
  if (group.status !== 'active') warnings.push('Група неактивна або позначена «Не публікувати».');
  if (group.advertising_policy === 'forbidden') warnings.push('У групі реклама заборонена.');
  if (group.advertising_policy === 'unknown') warnings.push('Правила реклами для групи не підтверджені.');
  if (group.moderation_required) warnings.push('Публікація в цій групі проходить модерацію.');
  if (lastPublishedAt && group.recommended_interval_days > 0) {
    const nextAllowed = new Date(lastPublishedAt);
    nextAllowed.setUTCDate(nextAllowed.getUTCDate() + Number(group.recommended_interval_days));
    const planned = new Date(`${plannedDate}T23:59:59.999Z`);
    if (nextAllowed > planned) {
      warnings.push(`Рекомендований повтор не раніше ${nextAllowed.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })}.`);
    }
  }
  return warnings;
}

export async function createFacebookPublicationCampaign(input, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groupIds = input.selections.map((selection) => selection.groupId);
    const groupPlaceholders = groupIds.map((_, index) => `$${index + 1}`).join(', ');
    const groups = await client.query(
      `SELECT groups.*, last_publication.last_published_at
       FROM facebook_publication_groups AS groups
       LEFT JOIN (
         SELECT group_id, MAX(published_at) AS last_published_at
         FROM facebook_publication_targets
         WHERE status = 'published'
         GROUP BY group_id
       ) AS last_publication ON last_publication.group_id = groups.id
       WHERE groups.id IN (${groupPlaceholders})`,
      groupIds
    );
    if (groups.rows.length !== groupIds.length) {
      throw new AppError(422, 'FACEBOOK_CAMPAIGN_GROUPS_INVALID', 'Частину вибраних Facebook-груп не знайдено.');
    }
    const selectedStoreIds = [...new Set(input.selections.map((selection) => selection.storeId))];
    const storePlaceholders = selectedStoreIds.map((_, index) => `$${index + 1}`).join(', ');
    const selectedStores = await client.query(
      `SELECT id, city, address
       FROM facebook_publication_stores
       WHERE id IN (${storePlaceholders})`,
      selectedStoreIds
    );
    if (selectedStores.rows.length !== selectedStoreIds.length) {
      throw new AppError(422, 'FACEBOOK_CAMPAIGN_STORES_INVALID', 'Частину вибраних міст і адрес не знайдено.');
    }
    const campaign = await client.query(
      `INSERT INTO facebook_publication_campaigns (
         title, promotion, planned_date, text_variants, asset_id, created_by
       ) VALUES ($1, $2, $3, $4::JSONB, $5, $6)
       RETURNING *`,
      [input.title, input.promotion, input.plannedDate, JSON.stringify(input.textVariants), input.assetId || null, user.id]
    );
    const byId = new Map(groups.rows.map((group) => [group.id, group]));
    const normalizedTexts = new Map();
    const storesById = new Map(selectedStores.rows.map((store) => [store.id, store]));
    for (const [index, selection] of input.selections.entries()) {
      const group = byId.get(selection.groupId);
      const selectedStore = storesById.get(selection.storeId);
      const variantIndex = index % input.textVariants.length;
      const renderedText = renderFacebookPublicationText(input.textVariants[variantIndex], {
        city: selectedStore.city,
        address: selectedStore.address,
        promotion: input.promotion
      });
      const warnings = await publicationWarnings(group, group.last_published_at, input.plannedDate);
      const textKey = normalizeFacebookPublicationText(renderedText);
      if (normalizedTexts.has(textKey)) {
        warnings.push(`Такий самий готовий текст уже використовується для групи «${normalizedTexts.get(textKey)}».`);
      } else {
        normalizedTexts.set(textKey, group.name);
      }
      const target = await client.query(
        `INSERT INTO facebook_publication_targets (
           campaign_id, group_id, store_id, group_name, group_url, city,
           store_name, address, rendered_text, text_variant_index, asset_id,
           warnings, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB, $13, $13)
         RETURNING id`,
        [campaign.rows[0].id, group.id, selectedStore.id, group.name, group.url, selectedStore.city,
          selectedStore.city, selectedStore.address, renderedText, variantIndex, input.assetId,
          JSON.stringify(warnings), user.id]
      );
      await client.query(
        `INSERT INTO facebook_publication_target_events (
           target_id, event_type, next_status, details, created_by
         ) VALUES ($1, 'created', 'not_started', $2::JSONB, $3)`,
        [target.rows[0].id, JSON.stringify({ warnings }), user.id]
      );
    }
    await client.query('COMMIT');
    return loadFacebookPublicationCampaign(campaign.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function loadFacebookPublicationCampaign(id, db = { query }) {
  const campaignResult = await db.query(
    `SELECT campaigns.*, users.name AS created_by_name,
            assets.file_name AS asset_file_name, assets.mime_type AS asset_mime_type,
            assets.size_bytes AS asset_size_bytes, assets.created_at AS asset_created_at
     FROM facebook_publication_campaigns AS campaigns
     JOIN users ON users.id = campaigns.created_by
     LEFT JOIN facebook_publication_assets AS assets ON assets.id = campaigns.asset_id
     WHERE campaigns.id = $1`,
    [id]
  );
  if (!campaignResult.rows[0]) throw new AppError(404, 'FACEBOOK_CAMPAIGN_NOT_FOUND', 'Кампанію не знайдено.');
  const targets = await db.query(
    `SELECT targets.*, users.name AS updated_by_name
     FROM facebook_publication_targets AS targets
     JOIN users ON users.id = targets.updated_by
     WHERE targets.campaign_id = $1
     ORDER BY targets.created_at, targets.group_name`,
    [id]
  );
  return serializeFacebookPublicationCampaign(campaignResult.rows[0], targets.rows);
}

export async function updateFacebookPublicationTarget(id, input, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM facebook_publication_targets WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new AppError(404, 'FACEBOOK_TARGET_NOT_FOUND', 'Публікацію для групи не знайдено.');
    const previous = current.rows[0];
    const nextStatus = input.status ?? previous.status;
    const publishedAt = nextStatus === 'published'
      ? previous.published_at || new Date()
      : null;
    const updated = await client.query(
      `UPDATE facebook_publication_targets
       SET status = $2, rendered_text = $3, post_url = $4, note = $5,
           published_at = $6, updated_by = $7, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, nextStatus, input.renderedText ?? previous.rendered_text,
        input.postUrl ?? previous.post_url, input.note ?? previous.note, publishedAt, user.id]
    );
    const eventType = (input.renderedText !== undefined && input.renderedText !== previous.rendered_text && nextStatus === previous.status)
      ? 'text_updated'
      : 'status';
    await client.query(
      `INSERT INTO facebook_publication_target_events (
         target_id, event_type, previous_status, next_status, details, created_by
       ) VALUES ($1, $2, $3, $4, $5::JSONB, $6)`,
      [id, eventType, previous.status, nextStatus,
        JSON.stringify({ postUrl: input.postUrl ?? previous.post_url, note: input.note ?? previous.note }), user.id]
    );
    await client.query('COMMIT');
    return serializeFacebookPublicationTarget({ ...updated.rows[0], updated_by_name: user.name });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recordFacebookPublicationActivity(id, activity, user) {
  const column = { opened: 'opened_at', copied: 'copied_at', image_opened: 'image_opened_at' }[activity];
  if (!column) throw new AppError(422, 'FACEBOOK_ACTIVITY_INVALID', 'Невідома дія публікації.');
  const result = await query(
    `UPDATE facebook_publication_targets
     SET ${column} = NOW(), updated_by = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, user.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'FACEBOOK_TARGET_NOT_FOUND', 'Публікацію для групи не знайдено.');
  await query(
    `INSERT INTO facebook_publication_target_events (target_id, event_type, details, created_by)
     VALUES ($1, 'activity', $2::JSONB, $3)`,
    [id, JSON.stringify({ activity }), user.id]
  );
  return serializeFacebookPublicationTarget({ ...result.rows[0], updated_by_name: user.name });
}

export async function retryFacebookPublicationTarget(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query('SELECT * FROM facebook_publication_targets WHERE id = $1 FOR UPDATE', [id]);
    if (!source.rows[0]) throw new AppError(404, 'FACEBOOK_TARGET_NOT_FOUND', 'Публікацію для групи не знайдено.');
    if (source.rows[0].status !== 'rejected') {
      throw new AppError(409, 'FACEBOOK_TARGET_RETRY_NOT_ALLOWED', 'Повторну спробу можна створити лише для відхиленої публікації.');
    }
    const row = source.rows[0];
    const created = await client.query(
      `INSERT INTO facebook_publication_targets (
         campaign_id, group_id, store_id, group_name, group_url, city, store_name,
         address, rendered_text, text_variant_index, asset_id, status, warnings,
         retry_of_target_id, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 'not_started', $12::JSONB, $13, $14, $14)
       RETURNING *`,
      [row.campaign_id, row.group_id, row.store_id, row.group_name, row.group_url,
        row.city, row.store_name, row.address, row.rendered_text, row.text_variant_index,
        row.asset_id, JSON.stringify(['Повторна спроба після відхилення.']), row.id, user.id]
    );
    await client.query(
      `INSERT INTO facebook_publication_target_events (
         target_id, event_type, previous_status, next_status, details, created_by
       ) VALUES ($1, 'retry_created', 'rejected', 'not_started', $2::JSONB, $3)`,
      [created.rows[0].id, JSON.stringify({ sourceTargetId: row.id }), user.id]
    );
    await client.query('COMMIT');
    return serializeFacebookPublicationTarget({ ...created.rows[0], updated_by_name: user.name });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function facebookPublicationRiskSummary(userId) {
  const recent = await query(
    `SELECT
       SUM(CASE WHEN events.created_at >= NOW() - INTERVAL '5 minutes' THEN 1 ELSE 0 END)::INTEGER AS last_five_minutes,
       SUM(CASE WHEN events.created_at >= NOW() - INTERVAL '15 minutes' THEN 1 ELSE 0 END)::INTEGER AS last_fifteen_minutes,
       MAX(events.created_at) AS latest_activity_at
     FROM facebook_publication_target_events AS events
     WHERE events.created_by = $1
       AND events.event_type = 'status'
       AND events.next_status IN ('published', 'pending_moderation')`,
    [userId]
  );
  const counts = recent.rows[0] || {};
  const lastFiveMinutes = Number(counts.last_five_minutes || 0);
  const lastFifteenMinutes = Number(counts.last_fifteen_minutes || 0);
  return {
    lastFiveMinutes,
    lastFifteenMinutes,
    latestActivityAt: counts.latest_activity_at || null,
    showBreakRecommendation: lastFifteenMinutes >= 6,
    showUrgentWarning: lastFiveMinutes >= 20,
    recommendedBreakMinutes: 15
  };
}
