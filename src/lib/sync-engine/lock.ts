import type { SyncRunRecord, SyncStore, SyncTrigger } from './types.ts';
import { isRunExpired } from './status.ts';

export interface AcquireRunInput {
  trigger: SyncTrigger;
  dryRun: boolean;
  actorName?: string;
  totalSources: number;
}

export async function acquireRun(
  store: SyncStore,
  input: AcquireRunInput,
  now: Date = new Date()
): Promise<
  { ok: true; run: SyncRunRecord } | { ok: false; reason: 'locked'; run: SyncRunRecord }
> {
  const existing = await store.findRunning();
  if (existing) {
    if (!isRunExpired(existing.started_at, now)) {
      return { ok: false, reason: 'locked', run: existing };
    }
    await store.expireRun(
      existing.id,
      now.toISOString(),
      'Run kedaluwarsa: tidak selesai dalam 15 menit.'
    );
  }

  try {
    const run = await store.createRun({
      trigger: input.trigger,
      dryRun: input.dryRun,
      actorName: input.actorName,
      totalSources: input.totalSources,
      startedAt: now.toISOString(),
    });
    return { ok: true, run };
  } catch (error: any) {
    // 23505 = unique violation: run lain menang balapan lock.
    if (error?.code === '23505') {
      const concurrent = await store.findRunning();
      if (concurrent) return { ok: false, reason: 'locked', run: concurrent };
    }
    throw error;
  }
}