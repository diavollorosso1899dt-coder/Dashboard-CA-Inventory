import type {
  RunSyncResponse,
  SourceRunResult,
  SyncContext,
  SyncRunOptions,
  SyncSource,
  SyncStore,
} from './types.ts';
import { resolveSourceOrder } from './registry.ts';
import { acquireRun } from './lock.ts';
import { aggregateRunStatus } from './status.ts';
import { shouldDebounce } from './debounce.ts';

export interface EngineDeps {
  store: SyncStore;
  sources: SyncSource[];
  now?: () => Date;
}

const DEFAULT_DEBOUNCE_MINUTES = 5;

function debounceMs(): number {
  const minutes = Number(process.env.SYNC_WEBHOOK_DEBOUNCE_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DEBOUNCE_MINUTES) * 60 * 1000;
}

function emptyResult(
  key: SyncSource['key'],
  label: string,
  status: SourceRunResult['status'],
  message: string
): SourceRunResult {
  return {
    key,
    label,
    status,
    rowsFetched: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsStale: 0,
    durationMs: 0,
    message,
  };
}

function summarize(results: SourceRunResult[]): {
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  changed: boolean;
  message: string;
} {
  const totalFetched = results.reduce((sum, r) => sum + r.rowsFetched, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.rowsInserted, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.rowsUpdated, 0);
  const failed = results.filter((r) => r.status === 'FAILED');
  return {
    totalFetched,
    totalInserted,
    totalUpdated,
    changed: totalInserted + totalUpdated > 0,
    message:
      failed.length === 0
        ? `Sync selesai: ${totalFetched} baris dibaca, ${totalInserted + totalUpdated} baris ditulis.`
        : `Sync selesai dengan ${failed.length} sumber gagal: ${failed
            .map((r) => `${r.key} (${r.message || 'error'})`)
            .join('; ')}`,
  };
}

export async function runSync(
  options: SyncRunOptions,
  deps: EngineDeps
): Promise<RunSyncResponse> {
  const now = deps.now || (() => new Date());
  const trigger = options.trigger || 'MANUAL';
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();

  const order = resolveSourceOrder(options.sources);
  const emptyResponse = (message: string): RunSyncResponse => ({
    success: false,
    status: 'FAILED',
    dryRun,
    trigger,
    durationMs: 0,
    message,
    sources: [],
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0,
    changed: false,
  });

  if (order.error) return emptyResponse(order.error);

  const sourceMap = new Map(deps.sources.map((s) => [s.key, s]));
  const missing = order.keys.filter((key) => !sourceMap.has(key));
  if (missing.length > 0) {
    return emptyResponse(`Sumber belum terdaftar di engine: ${missing.join(', ')}`);
  }

  if (trigger === 'WEBHOOK' && !dryRun) {
    const last = await deps.store.lastRunStartedAt(false);
    if (shouldDebounce(last, startedAtDate, debounceMs())) {
      return {
        success: true,
        skipped: true,
        reason: 'debounced',
        retryAfterMs: debounceMs(),
        status: 'SUCCESS',
        dryRun,
        trigger,
        durationMs: 0,
        message: 'Webhook diabaikan karena sync terakhir baru saja berjalan.',
        sources: [],
        totalFetched: 0,
        totalInserted: 0,
        totalUpdated: 0,
        changed: false,
      };
    }
  }

  let runId: string | undefined;
  if (!dryRun) {
    const lock = await acquireRun(
      deps.store,
      {
        trigger,
        dryRun,
        actorName: options.actorName,
        totalSources: order.keys.length,
      },
      startedAtDate
    );
    if (!lock.ok) {
      return {
        success: false,
        skipped: true,
        reason: 'locked',
        status: 'RUNNING',
        dryRun,
        trigger,
        durationMs: 0,
        message: `Sync sedang berjalan sejak ${lock.run.started_at}.`,
        sources: [],
        totalFetched: 0,
        totalInserted: 0,
        totalUpdated: 0,
        changed: false,
      };
    }
    runId = lock.run.id;
  }

  const results: SourceRunResult[] = [];
  const resultByKey = new Map<string, SourceRunResult>();

  const finish = async (finalResults: SourceRunResult[]): Promise<RunSyncResponse> => {
    const status = aggregateRunStatus(finalResults);
    const finishedAt = now().toISOString();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
    const summary = summarize(finalResults);
    const okSources = finalResults.filter((r) => r.status === 'SUCCESS').length;
    const failedSources = finalResults.filter((r) => r.status === 'FAILED').length;

    if (runId) {
      await deps.store.finishRun(runId, {
        status,
        finishedAt,
        durationMs,
        okSources,
        failedSources,
        message: summary.message,
      });
    }

    return {
      success: status === 'SUCCESS' || status === 'PARTIAL',
      runId,
      status,
      dryRun,
      trigger,
      durationMs,
      sources: finalResults,
      ...summary,
    };
  };

  try {
    for (const key of order.keys) {
      const source = sourceMap.get(key)!;
      const blocked = source.dependsOn.some((dep) => {
        const depResult = resultByKey.get(dep);
        return depResult && depResult.status !== 'SUCCESS';
      });
      if (blocked) {
        const skipped = emptyResult(
          key,
          source.label,
          'SKIPPED',
          'Dilewati karena sumber dependensi gagal.'
        );
        results.push(skipped);
        resultByKey.set(key, skipped);
        if (runId) {
          await deps.store.recordSource(runId, skipped, startedAt, now().toISOString());
        }
        continue;
      }

      const sourceStarted = now();
      try {
        const ctx: SyncContext = {
          dryRun,
          force,
          runStartedAt: startedAt,
          sourceOptions: options.sourceOptions,
        };
        const partial = await source.run(ctx);
        const result: SourceRunResult = {
          key,
          label: source.label,
          durationMs: Math.max(0, now().getTime() - sourceStarted.getTime()),
          ...partial,
        };
        results.push(result);
        resultByKey.set(key, result);
        if (runId) {
          await deps.store.recordSource(
            runId,
            result,
            sourceStarted.toISOString(),
            now().toISOString()
          );
        }
      } catch (error: any) {
        const failed = emptyResult(key, source.label, 'FAILED', error?.message || 'Gagal sync.');
        failed.durationMs = Math.max(0, now().getTime() - sourceStarted.getTime());
        results.push(failed);
        resultByKey.set(key, failed);
        if (runId) {
          await deps.store.recordSource(
            runId,
            failed,
            sourceStarted.toISOString(),
            now().toISOString()
          );
        }
      }
    }

    return await finish(results);
  } catch (error: any) {
    if (runId) {
      await deps.store.finishRun(runId, {
        status: 'FAILED',
        finishedAt: now().toISOString(),
        durationMs: Math.max(0, now().getTime() - startedAtDate.getTime()),
        okSources: results.filter((r) => r.status === 'SUCCESS').length,
        failedSources: results.filter((r) => r.status === 'FAILED').length,
        message: error?.message || 'Engine gagal.',
      });
    }
    throw error;
  }
}