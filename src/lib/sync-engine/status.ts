import type { SyncRunStatus, SyncSourceStatus } from './types.ts';

const RUN_TTL_MS = 15 * 60 * 1000;

export function aggregateRunStatus(
  results: Array<{ status: SyncSourceStatus }>
): SyncRunStatus {
  if (results.length === 0) return 'FAILED';
  const success = results.filter((r) => r.status === 'SUCCESS').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  if (success > 0 && failed > 0) return 'PARTIAL';
  if (failed > 0) return 'FAILED';
  if (success > 0) return 'SUCCESS';
  return 'FAILED';
}

export function isRunExpired(
  startedAt: string,
  now: Date = new Date(),
  ttlMs: number = RUN_TTL_MS
): boolean {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return true;
  return now.getTime() - started > ttlMs;
}