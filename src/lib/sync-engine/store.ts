import { getAdminClient } from '@/lib/supabase/server';
import type {
  SourceRunResult,
  SyncRunOptions,
  SyncRunRecord,
  SyncRunStatus,
  SyncStore,
  SyncTrigger,
} from './types.ts';

function client() {
  const admin = getAdminClient();
  if (!admin) throw new Error('Supabase belum dikonfigurasi di server.');
  return admin;
}

export class SupabaseSyncStore implements SyncStore {
  async findRunning(): Promise<SyncRunRecord | null> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('id,started_at,status,trigger,dry_run')
      .eq('status', 'RUNNING')
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SyncRunRecord | null) ?? null;
  }

  async expireRun(id: string, finishedAt: string, message: string): Promise<void> {
    const { error } = await client()
      .from('sync_runs')
      .update({ status: 'FAILED', finished_at: finishedAt, message })
      .eq('id', id)
      .eq('status', 'RUNNING');
    if (error) throw new Error(error.message);
  }

  async createRun(input: {
    trigger: SyncTrigger;
    dryRun: boolean;
    actorName?: string;
    totalSources: number;
    startedAt: string;
  }): Promise<SyncRunRecord> {
    const { data, error } = await client()
      .from('sync_runs')
      .insert({
        trigger: input.trigger,
        dry_run: input.dryRun,
        actor_name: input.actorName || 'System',
        total_sources: input.totalSources,
        started_at: input.startedAt,
        status: 'RUNNING',
      })
      .select('id,started_at,status,trigger,dry_run')
      .single();
    if (error) throw error;
    return data as SyncRunRecord;
  }

  async finishRun(
    id: string,
    patch: {
      status: SyncRunStatus;
      finishedAt: string;
      durationMs: number;
      okSources: number;
      failedSources: number;
      message: string;
    }
  ): Promise<void> {
    const { error } = await client()
      .from('sync_runs')
      .update({
        status: patch.status,
        finished_at: patch.finishedAt,
        duration_ms: patch.durationMs,
        ok_sources: patch.okSources,
        failed_sources: patch.failedSources,
        message: patch.message,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async recordSource(
    runId: string,
    result: SourceRunResult,
    startedAt: string,
    finishedAt: string
  ): Promise<void> {
    const { error } = await client().from('sync_run_sources').insert({
      run_id: runId,
      source_key: result.key,
      status: result.status,
      rows_fetched: result.rowsFetched,
      rows_inserted: result.rowsInserted,
      rows_updated: result.rowsUpdated,
      rows_skipped: result.rowsSkipped,
      rows_stale: result.rowsStale,
      duration_ms: result.durationMs,
      error_message: result.status === 'FAILED' ? result.message : null,
      details: result.details || {},
      started_at: startedAt,
      finished_at: finishedAt,
    });
    if (error) throw new Error(error.message);
  }

  async lastRunStartedAt(dryRun: boolean): Promise<string | null> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('started_at')
      .eq('dry_run', dryRun)
      .neq('status', 'RUNNING')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.started_at ?? null;
  }

  async getStatus(): Promise<unknown> {
    const admin = client();
    const [{ data: runs }, { data: sources }] = await Promise.all([
      admin.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(10),
      admin
        .from('sync_run_sources')
        .select('*')
        .order('finished_at', { ascending: false })
        .limit(20),
    ]);
    return { runs: runs || [], sources: sources || [] };
  }

  async getHistory(limit: number): Promise<unknown> {
    const { data, error } = await client()
      .from('sync_runs')
      .select('*, sync_run_sources(*)')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  }
}

export type SyncRequestOptions = SyncRunOptions;