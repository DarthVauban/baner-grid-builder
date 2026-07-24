export type SystemHealthStatus = 'operational' | 'degraded' | 'critical' | 'inactive' | 'unknown';

export interface SystemDiagnosticIssue {
  id: 'cpu' | 'memory' | 'storage' | 'database' | 'api' | 'photo-parser' | 'backups';
  component: string;
  status: 'degraded' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  action?: {
    label: string;
    href: string;
  };
}

export interface SystemServiceStatus {
  id: 'api' | 'database' | 'storage' | 'photo-parser' | 'backups';
  label: string;
  status: SystemHealthStatus;
  detail: string;
}

export interface SystemMetrics {
  sampledAt: string;
  status: SystemHealthStatus;
  issues: SystemDiagnosticIssue[];
  services: SystemServiceStatus[];
  cpu: {
    status: SystemHealthStatus;
    usagePercent: number;
    processPercent: number;
    cores: number;
    model: string;
    loadAverage: number[];
  };
  memory: {
    status: SystemHealthStatus;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
    process: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
  };
  storage: {
    status: SystemHealthStatus;
    writable: boolean;
    persistent: boolean;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  database: {
    status: SystemHealthStatus;
    latencyMs: number;
    sizeBytes: number | null;
    serverTime: string | null;
    latestMigration: string;
    pool: {
      total: number;
      idle: number;
      waiting: number;
    };
  };
  runtime: {
    environment: 'development' | 'test' | 'production';
    buildSha: string;
    nodeVersion: string;
    platform: string;
    platformRelease: string;
    architecture: string;
    hostname: string;
    processId: number;
    processUptimeSeconds: number;
    hostUptimeSeconds: number;
    eventLoopUtilizationPercent: number;
    collectionDurationMs: number;
  };
  workload: {
    approvedUsers: number;
    activeTasks: number;
    openApplications: number;
    photoParser: {
      queued: number;
      running: number;
      failedLast24Hours: number;
    };
    backups: {
      automaticEnabled: boolean;
      nextRunAt: string | null;
      lastRunAt: string | null;
      latestStatus: 'success' | 'failed' | null;
      latestCompletedAt: string | null;
    };
  };
}
