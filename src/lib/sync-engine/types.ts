export type SyncSourceKey = 'asset-requests' | 'request-orders' | 'master-catalog';
export type SyncRunStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
export type SyncSourceStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type SyncTrigger = 'MANUAL' | 'CRON' | 'WEBHOOK';
export type SyncRegion = 'JABODETABEK' | 'KALBAR';

export interface RegionHealth {
  ok: boolean;
  count: number;
  error?: string;
}

export type RegionHealthMap = Partial<Record<SyncRegion, RegionHealth>>;

export interface SourceRunResult {
  key: SyncSourceKey;
  label: string;
  status: SyncSourceStatus;
  rowsFetched: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsStale: number;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SyncContext {
  dryRun: boolean;
  force: boolean;
  runStartedAt: string;
  sourceOptions?: Record<string, unknown>;
}

export interface SyncSource {
  key: SyncSourceKey;
  label: string;
  dependsOn: SyncSourceKey[];
  run(ctx: SyncContext): Promise<Omit<SourceRunResult, 'key' | 'label' | 'durationMs'>>;
}

export interface SyncRunRecord {
  id: string;
  started_at: string;
  status: SyncRunStatus;
  trigger: SyncTrigger;
  dry_run: boolean;
}

export interface SyncRunSourceRecord extends SourceRunResult {
  id: string;
  run_id: string;
  started_at: string;
  finished_at: string;
}

export interface SyncRunOptions {
  sources?: string[];
  dryRun?: boolean;
  force?: boolean;
  trigger?: SyncTrigger;
  actorName?: string;
  sourceOptions?: Record<string, unknown>;
}

export interface RunSyncResponse {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  retryAfterMs?: number;
  runId?: string;
  status: SyncRunStatus;
  dryRun: boolean;
  trigger: SyncTrigger;
  durationMs: number;
  message: string;
  sources: SourceRunResult[];
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  changed: boolean;
}

export interface SyncStore {
  findRunning(): Promise<SyncRunRecord | null>;
  expireRun(id: string, finishedAt: string, message: string): Promise<void>;
  createRun(input: {
    trigger: SyncTrigger;
    dryRun: boolean;
    actorName?: string;
    totalSources: number;
    startedAt: string;
  }): Promise<SyncRunRecord>;
  finishRun(
    id: string,
    patch: {
      status: SyncRunStatus;
      finishedAt: string;
      durationMs: number;
      okSources: number;
      failedSources: number;
      message: string;
    }
  ): Promise<void>;
  recordSource(
    runId: string,
    result: SourceRunResult,
    startedAt: string,
    finishedAt: string
  ): Promise<void>;
  lastRunStartedAt(dryRun: boolean): Promise<string | null>;
  getStatus(): Promise<unknown>;
  getHistory(limit: number): Promise<unknown>;
}