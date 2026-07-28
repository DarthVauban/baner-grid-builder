import { AppError } from '../../lib/app-error.js';

export const storeMapToolId = 'store_map';
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function normalizeStoreMapText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseStoreMapCoordinate(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/[?&]q=(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/i)
    || text.match(/@(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/)
    || text.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1].replace(',', '.'));
  const longitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function extractStoreMapCity(name, address = '') {
  const source = String(name || address || '').trim();
  const withoutPrefix = source.replace(/^(?:м\.?|місто|смт\.?|селище|с\.?|село)\s*/iu, '');
  const city = withoutPrefix.split(/[,;(]/, 1)[0]?.trim() || '';
  return city.slice(0, 120);
}

export function scheduleFromHoursText(hoursText) {
  const text = String(hoursText ?? '').trim();
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return {};
  const interval = { open: `${match[1]}:${match[2]}`, close: `${match[3]}:${match[4]}` };
  return {
    timezone: 'Europe/Kyiv',
    days: Object.fromEntries(weekdays.map((day) => [day, [interval]]))
  };
}

function kyivClock(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = values.weekday.toLowerCase().slice(0, 3);
  return { day, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function minutes(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

export function isStoreMapPointOpen(point, now = new Date()) {
  if (point.openStatusOverride === 'OPEN' || point.open_status_override === 'OPEN') return true;
  if (point.openStatusOverride === 'CLOSED' || point.open_status_override === 'CLOSED') return false;
  const schedule = point.schedule && typeof point.schedule === 'object'
    ? point.schedule
    : scheduleFromHoursText(point.hoursText || point.hours_text || '');
  const clock = kyivClock(now);
  const intervals = schedule?.days?.[clock.day];
  if (!Array.isArray(intervals)) return false;
  return intervals.some((interval) => {
    const open = minutes(interval.open);
    const close = minutes(interval.close);
    if (open === null || close === null) return false;
    if (open === close) return true;
    if (close > open) return clock.minutes >= open && clock.minutes < close;
    return clock.minutes >= open || clock.minutes < close;
  });
}

export function sanitizeStoreMapSvg(value) {
  const source = String(value ?? '').trim();
  if (!source) return '';
  if (Buffer.byteLength(source, 'utf8') > 150_000) {
    throw new AppError(422, 'STORE_MAP_MARKER_TOO_LARGE', 'SVG-мітка має бути меншою за 150 КБ.');
  }
  if (!/^<svg[\s>]/i.test(source) || !/<\/svg>\s*$/i.test(source)) {
    throw new AppError(422, 'STORE_MAP_MARKER_INVALID', 'Файл не містить коректний SVG.');
  }
  const dangerous = [
    /<!doctype/i,
    /<!entity/i,
    /<\s*(?:script|style|foreignObject|iframe|object|embed|image|audio|video|canvas)\b/i,
    /\son[a-z]+\s*=/i,
    /javascript\s*:/i,
    /\burl\s*\(/i,
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)/i
  ];
  if (dangerous.some((pattern) => pattern.test(source))) {
    throw new AppError(422, 'STORE_MAP_MARKER_UNSAFE', 'SVG містить небезпечні або зовнішні елементи.');
  }
  return source
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

export function serializeStoreMapPoint(row) {
  return {
    id: row.id,
    externalId: row.external_id || '',
    name: row.name,
    city: row.city,
    address: row.address,
    hoursText: row.hours_text || '',
    schedule: row.schedule || {},
    publicationStatus: row.publication_status,
    openStatusOverride: row.open_status_override,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeStoreMapSettings(row) {
  return {
    publicId: row.public_id,
    title: row.title,
    markerSvg: row.marker_svg || '',
    markerWidth: Number(row.marker_width),
    markerHeight: Number(row.marker_height),
    markerAnchorX: Number(row.marker_anchor_x),
    markerAnchorY: Number(row.marker_anchor_y),
    centerLatitude: Number(row.center_latitude),
    centerLongitude: Number(row.center_longitude),
    defaultZoom: Number(row.default_zoom),
    updatedAt: row.updated_at
  };
}

function rowLookup(row) {
  return new Map(
    Object.entries(row || {}).map(([key, value]) => [normalizeStoreMapText(key), value])
  );
}

function firstValue(lookup, aliases) {
  for (const alias of aliases) {
    const value = lookup.get(normalizeStoreMapText(alias));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function publicationStatus(value) {
  const normalized = normalizeStoreMapText(value);
  return ['прихований', 'hidden', 'inactive', 'неактивний'].includes(normalized) ? 'HIDDEN' : 'ACTIVE';
}

function importSummary(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    summary[row.action] += 1;
    return summary;
  }, { total: 0, create: 0, update: 0, error: 0, conflict: 0, skipped: 0 });
}

function coordinateKey(latitude, longitude) {
  return `${Number(latitude).toFixed(7)},${Number(longitude).toFixed(7)}`;
}

export async function analyzeStoreMapImportRows(rawRows, db) {
  const existingResult = await db.query(
    `SELECT * FROM store_map_points
     WHERE archived_at IS NULL
     ORDER BY created_at`
  );
  const byExternalId = new Map();
  const byCoordinate = new Map();
  const byNameAddress = new Map();
  existingResult.rows.forEach((point) => {
    if (point.external_id) byExternalId.set(point.external_id, point);
    byCoordinate.set(coordinateKey(point.latitude, point.longitude), point);
    const identity = `${point.normalized_name}|${normalizeStoreMapText(point.address)}`;
    if (!byNameAddress.has(identity)) byNameAddress.set(identity, []);
    byNameAddress.get(identity).push(point);
  });

  const seen = new Map();
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((raw, index) => {
    const lookup = rowLookup(raw);
    const name = String(firstValue(lookup, ['Назва магазину', 'Назва', 'Name', 'Store name'])).trim();
    const address = String(firstValue(lookup, ['Адреса', 'Address'])).trim();
    const hoursText = String(firstValue(lookup, ['Час роботи', 'Графік роботи', 'Hours'])).trim();
    const coordinateValue = firstValue(lookup, ['Координати', 'Coordinates', 'Google Maps']);
    const coordinates = parseStoreMapCoordinate(coordinateValue);
    const externalId = String(firstValue(lookup, ['ID', 'Ідентифікатор', 'Код ТТ', 'Store ID'])).trim().slice(0, 120);
    const city = String(firstValue(lookup, ['Місто', 'City'])).trim() || extractStoreMapCity(name, address);
    const row = {
      rowNumber: index + 2,
      externalId,
      name: name.slice(0, 240),
      city: city.slice(0, 120),
      address: address.slice(0, 500),
      hoursText: hoursText.slice(0, 120),
      publicationStatus: publicationStatus(firstValue(lookup, ['Статус', 'Status'])),
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      pointId: null,
      action: 'create',
      result: 'ready',
      reason: ''
    };

    if (!row.name || !row.address || !row.city || !coordinates) {
      row.action = 'error';
      row.result = 'error';
      row.reason = !coordinates
        ? 'Некоректні координати. Підтримується Google Maps URL або пара latitude,longitude.'
        : 'Назва, місто та адреса є обовʼязковими.';
      return row;
    }

    const fileKey = externalId ? `id:${externalId}` : `coord:${coordinateKey(row.latitude, row.longitude)}`;
    if (seen.has(fileKey)) {
      row.action = 'conflict';
      row.result = 'conflict';
      row.reason = `Дублікат у файлі з рядком ${seen.get(fileKey)}.`;
      return row;
    }
    seen.set(fileKey, row.rowNumber);

    let match = externalId ? byExternalId.get(externalId) : null;
    match ||= byCoordinate.get(coordinateKey(row.latitude, row.longitude));
    if (!match) {
      const identity = `${normalizeStoreMapText(row.name)}|${normalizeStoreMapText(row.address)}`;
      const candidates = byNameAddress.get(identity) || [];
      if (candidates.length > 1) {
        row.action = 'conflict';
        row.result = 'conflict';
        row.reason = 'Знайдено декілька ТТ з такою назвою та адресою.';
        return row;
      }
      match = candidates[0] || null;
    }
    if (match) {
      row.pointId = match.id;
      row.action = 'update';
    }
    return row;
  });

  return { rows, summary: importSummary(rows) };
}

async function insertPoint(db, row, actorId) {
  const result = await db.query(
    `INSERT INTO store_map_points (
       external_id, name, normalized_name, city, normalized_city, address,
       hours_text, schedule, publication_status, open_status_override,
       latitude, longitude, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9, 'AUTO', $10, $11, $12, $12)
     RETURNING *`,
    [
      row.externalId || '',
      row.name,
      normalizeStoreMapText(row.name),
      row.city,
      normalizeStoreMapText(row.city),
      row.address,
      row.hoursText || '',
      JSON.stringify(scheduleFromHoursText(row.hoursText)),
      row.publicationStatus,
      row.latitude,
      row.longitude,
      actorId
    ]
  );
  return result.rows[0];
}

async function updatePointFromImport(db, row, actorId) {
  const result = await db.query(
    `UPDATE store_map_points
     SET external_id = CASE WHEN $1 <> '' THEN $1 ELSE external_id END,
         name = $2,
         normalized_name = $3,
         city = $4,
         normalized_city = $5,
         address = $6,
         hours_text = $7,
         schedule = $8::JSONB,
         publication_status = $9,
         latitude = $10,
         longitude = $11,
         updated_by = $12,
         updated_at = NOW()
     WHERE id = $13 AND archived_at IS NULL
     RETURNING *`,
    [
      row.externalId || '',
      row.name,
      normalizeStoreMapText(row.name),
      row.city,
      normalizeStoreMapText(row.city),
      row.address,
      row.hoursText || '',
      JSON.stringify(scheduleFromHoursText(row.hoursText)),
      row.publicationStatus,
      row.latitude,
      row.longitude,
      actorId,
      row.pointId
    ]
  );
  return result.rows[0];
}

export async function commitStoreMapImportRows(rawRows, options, actorId, db) {
  const analysis = await analyzeStoreMapImportRows(rawRows, db);
  const importOptions = {
    importNew: options.importNew !== false,
    updateExisting: options.updateExisting !== false
  };
  const importResult = await db.query(
    `INSERT INTO store_map_imports (created_by, options, summary)
     VALUES ($1, $2::JSONB, $3::JSONB)
     RETURNING id`,
    [actorId, JSON.stringify(importOptions), JSON.stringify(analysis.summary)]
  );
  const importId = importResult.rows[0].id;
  const committedRows = [];

  for (const candidate of analysis.rows) {
    const row = { ...candidate };
    if (row.action === 'create' && !importOptions.importNew) {
      row.action = 'skipped';
      row.result = 'skipped';
      row.reason = 'Створення нових ТТ вимкнено.';
    } else if (row.action === 'update' && !importOptions.updateExisting) {
      row.action = 'skipped';
      row.result = 'skipped';
      row.reason = 'Оновлення наявних ТТ вимкнено.';
    } else if (row.action === 'create') {
      const point = await insertPoint(db, row, actorId);
      row.pointId = point.id;
      row.result = 'created';
    } else if (row.action === 'update') {
      await updatePointFromImport(db, row, actorId);
      row.result = 'updated';
    }
    await db.query(
      `INSERT INTO store_map_import_rows (
         import_id, row_number, action, result, reason, point_id, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
      [
        importId,
        row.rowNumber,
        row.action,
        row.result === 'ready' ? row.action : row.result,
        row.reason || '',
        row.pointId,
        JSON.stringify({
          externalId: row.externalId,
          name: row.name,
          city: row.city,
          address: row.address,
          hoursText: row.hoursText,
          publicationStatus: row.publicationStatus,
          latitude: row.latitude,
          longitude: row.longitude
        })
      ]
    );
    committedRows.push(row);
  }
  const summary = committedRows.reduce((result, row) => {
    result.total += 1;
    const key = row.result === 'ready' ? row.action : row.result;
    if (Object.hasOwn(result, key)) result[key] += 1;
    return result;
  }, { total: 0, created: 0, updated: 0, error: 0, conflict: 0, skipped: 0 });
  await db.query(
    'UPDATE store_map_imports SET summary = $1::JSONB WHERE id = $2',
    [JSON.stringify(summary), importId]
  );
  return { importId, rows: committedRows, summary };
}

export function storeMapEmbedScript(origin) {
  return `(() => {
  const script = document.currentScript;
  if (!script) return;
  const containerId = script.dataset.container || '';
  let container = containerId ? document.getElementById(containerId) : null;
  if (!container) {
    container = document.createElement('div');
    script.parentNode.insertBefore(container, script.nextSibling);
  }
  const frame = document.createElement('iframe');
  const widgetUrl = new URL('/store-map/widget', ${JSON.stringify(origin)});
  frame.src = widgetUrl.toString();
  frame.title = script.dataset.title || 'Мапа магазинів';
  frame.loading = 'lazy';
  frame.style.display = 'block';
  frame.style.width = '100%';
  frame.style.height = (Number(script.dataset.height) || 680) + 'px';
  frame.style.border = '0';
  frame.style.borderRadius = script.dataset.radius || '16px';
  frame.setAttribute('allow', 'geolocation');
  container.appendChild(frame);
  window.addEventListener('message', (event) => {
    if (event.origin !== widgetUrl.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type !== 'mt-store-map:height') return;
    const height = Math.max(480, Math.min(1400, Number(event.data.height) || 680));
    frame.style.height = height + 'px';
  });
})();`;
}
