import { constants } from 'node:fs';
import { access, statfs } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { catalogMediaDir } from '../catalog/catalog.media.js';

const criticalUsagePercent = 95;
const degradedUsagePercent = 80;

function boundedPercent(value) {
  return Math.round(Math.min(100, Math.max(0, Number(value) || 0)) * 10) / 10;
}

function usageStatus(percent) {
  if (percent >= criticalUsagePercent) return 'critical';
  if (percent >= degradedUsagePercent) return 'degraded';
  return 'operational';
}

function cpuTicks() {
  return os.cpus().reduce((summary, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return {
      idle: summary.idle + cpu.times.idle,
      total: summary.total + total
    };
  }, { idle: 0, total: 0 });
}

let previousCpuTicks = cpuTicks();
let previousProcessCpu = process.cpuUsage();
let previousProcessSampleAt = process.hrtime.bigint();
let previousEventLoopUtilization = performance.eventLoopUtilization();

function sampleCpu() {
  const cpus = os.cpus();
  const currentTicks = cpuTicks();
  const totalDelta = currentTicks.total - previousCpuTicks.total;
  const idleDelta = currentTicks.idle - previousCpuTicks.idle;
  previousCpuTicks = currentTicks;
  const systemPercent = totalDelta > 0
    ? boundedPercent(((totalDelta - idleDelta) / totalDelta) * 100)
    : 0;

  const sampledAt = process.hrtime.bigint();
  const elapsedMicroseconds = Number(sampledAt - previousProcessSampleAt) / 1000;
  const processDelta = process.cpuUsage(previousProcessCpu);
  previousProcessCpu = process.cpuUsage();
  previousProcessSampleAt = sampledAt;
  const rawProcessPercent = elapsedMicroseconds > 0
    ? ((processDelta.user + processDelta.system) / elapsedMicroseconds) * 100
    : 0;
  const processPercent = boundedPercent(rawProcessPercent / Math.max(cpus.length, 1));

  return {
    status: usageStatus(systemPercent),
    usagePercent: systemPercent,
    processPercent,
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown CPU',
    loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100)
  };
}

function sampleMemory() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const usagePercent = totalBytes ? boundedPercent((usedBytes / totalBytes) * 100) : 0;
  const processMemory = process.memoryUsage();
  return {
    status: usageStatus(usagePercent),
    totalBytes,
    usedBytes,
    freeBytes,
    usagePercent,
    process: {
      rssBytes: processMemory.rss,
      heapUsedBytes: processMemory.heapUsed,
      heapTotalBytes: processMemory.heapTotal,
      externalBytes: processMemory.external
    }
  };
}

async function sampleStorage() {
  try {
    await access(catalogMediaDir, constants.R_OK | constants.W_OK);
    const stats = await statfs(catalogMediaDir);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usagePercent = totalBytes ? boundedPercent((usedBytes / totalBytes) * 100) : 0;
    return {
      status: usageStatus(usagePercent),
      writable: true,
      persistent: Boolean(String(process.env.CATALOG_MEDIA_DIR || '').trim()),
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent
    };
  } catch {
    return {
      status: 'critical',
      writable: false,
      persistent: Boolean(String(process.env.CATALOG_MEDIA_DIR || '').trim()),
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usagePercent: 0
    };
  }
}

async function sampleDatabase() {
  const startedAt = performance.now();
  try {
    const clock = await query('SELECT NOW() AS server_time');
    let sizeBytes = null;
    let latestMigration = '';
    try {
      if (!env.DATABASE_URL.startsWith('pg-mem://')) {
        const size = await query('SELECT pg_database_size(current_database())::BIGINT AS size_bytes');
        sizeBytes = Number(size.rows[0]?.size_bytes || 0);
      }
      const migration = await query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1');
      latestMigration = migration.rows[0]?.name || '';
    } catch {
      // Size and migration metadata are optional diagnostics.
    }
    const latencyMs = Math.round((performance.now() - startedAt) * 10) / 10;
    return {
      status: latencyMs >= 1000 ? 'degraded' : 'operational',
      latencyMs,
      sizeBytes,
      serverTime: clock.rows[0]?.server_time || null,
      latestMigration,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
  } catch {
    return {
      status: 'critical',
      latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
      sizeBytes: null,
      serverTime: null,
      latestMigration: '',
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
  }
}

async function sampleWorkload(databaseAvailable) {
  if (!databaseAvailable) {
    return {
      approvedUsers: 0,
      activeTasks: 0,
      openApplications: 0,
      photoParser: { queued: 0, running: 0, failedLast24Hours: 0 },
      backups: { automaticEnabled: false, nextRunAt: null, lastRunAt: null, latestStatus: null, latestCompletedAt: null }
    };
  }

  try {
    const [users, tasks, applications, parser, backupSettings, latestBackup] = await Promise.all([
      query("SELECT COUNT(*)::INTEGER AS count FROM users WHERE status = 'approved'"),
      query("SELECT COUNT(*)::INTEGER AS count FROM tasks WHERE status = 'active'"),
      query("SELECT COUNT(*)::INTEGER AS count FROM applications WHERE status IN ('new', 'in_progress')"),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0)::INTEGER AS queued,
           COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::INTEGER AS running,
           COALESCE(SUM(CASE WHEN status = 'failed' AND completed_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::INTEGER AS failed_last_24_hours
         FROM used_smartphone_photo_parser_runs`
      ),
      query('SELECT automatic_enabled, next_run_at, last_run_at FROM backup_settings WHERE id = TRUE'),
      query('SELECT status, completed_at FROM backup_runs ORDER BY started_at DESC LIMIT 1')
    ]);
    return {
      approvedUsers: Number(users.rows[0]?.count || 0),
      activeTasks: Number(tasks.rows[0]?.count || 0),
      openApplications: Number(applications.rows[0]?.count || 0),
      photoParser: {
        queued: Number(parser.rows[0]?.queued || 0),
        running: Number(parser.rows[0]?.running || 0),
        failedLast24Hours: Number(parser.rows[0]?.failed_last_24_hours || 0)
      },
      backups: {
        automaticEnabled: backupSettings.rows[0]?.automatic_enabled === true,
        nextRunAt: backupSettings.rows[0]?.next_run_at || null,
        lastRunAt: backupSettings.rows[0]?.last_run_at || null,
        latestStatus: latestBackup.rows[0]?.status || null,
        latestCompletedAt: latestBackup.rows[0]?.completed_at || null
      }
    };
  } catch {
    return {
      approvedUsers: 0,
      activeTasks: 0,
      openApplications: 0,
      photoParser: { queued: 0, running: 0, failedLast24Hours: 0 },
      backups: { automaticEnabled: false, nextRunAt: null, lastRunAt: null, latestStatus: null, latestCompletedAt: null }
    };
  }
}

function serviceStatus({ database, storage, workload, collectionDurationMs }) {
  const parserStatus = workload.photoParser.failedLast24Hours > 0 ? 'degraded' : 'operational';
  const backupStatus = workload.backups.latestStatus === 'failed'
    ? 'degraded'
    : workload.backups.automaticEnabled || workload.backups.latestStatus === 'success'
      ? 'operational'
      : 'inactive';
  return [
    {
      id: 'api',
      label: 'API сервера',
      status: collectionDurationMs >= 1500 ? 'degraded' : 'operational',
      detail: `${collectionDurationMs} мс на збір метрик`
    },
    {
      id: 'database',
      label: 'PostgreSQL',
      status: database.status,
      detail: database.status === 'critical' ? 'Немає з’єднання' : `${database.latencyMs} мс`
    },
    {
      id: 'storage',
      label: 'Сховище медіа',
      status: storage.status,
      detail: storage.writable ? (storage.persistent ? 'Постійний том, запис доступний' : 'Локальний том, запис доступний') : 'Запис недоступний'
    },
    {
      id: 'photo-parser',
      label: 'Фотопарсер',
      status: parserStatus,
      detail: workload.photoParser.running
        ? `Обробляється: ${workload.photoParser.running}`
        : workload.photoParser.queued
          ? `У черзі: ${workload.photoParser.queued}`
          : workload.photoParser.failedLast24Hours
            ? `Помилок за 24 год: ${workload.photoParser.failedLast24Hours}`
            : 'Черга порожня'
    },
    {
      id: 'backups',
      label: 'Резервні копії',
      status: backupStatus,
      detail: backupStatus === 'inactive'
        ? 'Автоматичний розклад вимкнено'
        : backupStatus === 'degraded'
          ? 'Остання операція завершилась помилкою'
          : workload.backups.automaticEnabled ? 'Автоматичний розклад активний' : 'Остання операція успішна'
    }
  ];
}

function overallStatus(resources, services) {
  if (resources.some((resource) => resource.status === 'critical') || services.some((service) => service.status === 'critical')) return 'critical';
  if (resources.some((resource) => resource.status === 'degraded') || services.some((service) => service.status === 'degraded')) return 'degraded';
  return 'operational';
}

export async function collectSystemMetrics() {
  const startedAt = performance.now();
  const [storage, database] = await Promise.all([sampleStorage(), sampleDatabase()]);
  const workload = await sampleWorkload(database.status !== 'critical');
  const cpu = sampleCpu();
  const memory = sampleMemory();
  const eventLoop = performance.eventLoopUtilization(previousEventLoopUtilization);
  previousEventLoopUtilization = performance.eventLoopUtilization();
  const collectionDurationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  const services = serviceStatus({ database, storage, workload, collectionDurationMs });
  const status = overallStatus([cpu, memory, storage, database], services);

  return {
    sampledAt: new Date().toISOString(),
    status,
    services,
    cpu,
    memory,
    storage,
    database,
    runtime: {
      environment: env.NODE_ENV,
      buildSha: env.APP_BUILD_SHA,
      nodeVersion: process.version,
      platform: os.platform(),
      platformRelease: os.release(),
      architecture: os.arch(),
      hostname: os.hostname(),
      processId: process.pid,
      processUptimeSeconds: Math.round(process.uptime()),
      hostUptimeSeconds: Math.round(os.uptime()),
      eventLoopUtilizationPercent: boundedPercent(eventLoop.utilization * 100),
      collectionDurationMs
    },
    workload
  };
}
