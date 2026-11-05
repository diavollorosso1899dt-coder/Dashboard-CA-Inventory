import type { SyncSource } from '../types.ts';
import { fetchAllSheetsData } from '@/lib/sync/sheet-fetcher';
import { syncGoogleSheetsToSupabase } from '@/lib/supabase/server';
import { markAssetRowsStale } from '../stale-store.ts';

export const assetRequestsSource: SyncSource = {
  key: 'asset-requests',
  label: 'Aset (JABO + KALBAR)',
  dependsOn: [],
  async run(ctx) {
    if (ctx.dryRun) {
      const { stats, regions } = await fetchAllSheetsData();
      const allFailed = !regions.JABODETABEK.ok && !regions.KALBAR.ok;
      return {
        status: allFailed ? 'FAILED' : 'SUCCESS',
        rowsFetched: stats.totalCount,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsStale: 0,
        message: allFailed
          ? 'Dry-run: kedua sheet aset tidak dapat dibaca.'
          : `Dry-run: ${stats.totalCount} baris terbaca (JABO: ${stats.jaboCount}, KALBAR: ${stats.kalbarCount}).`,
        details: { regions },
      };
    }

    const result = await syncGoogleSheetsToSupabase({ force: ctx.force });
    if (!result.success) {
      return {
        status: 'FAILED',
        rowsFetched: result.totalFetched,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsStale: 0,
        message: result.message,
        details: { regions: result.regions },
      };
    }

    // `changed === false` berarti sync dilewati karena isi sheet sama persis
    // (content hash) atau Supabase tidak bisa ditulis. Jangan tandai stale:
    // baris lama bukan berarti hilang dari sheet.
    const rowsStale = result.changed
      ? await markAssetRowsStale(ctx.runStartedAt, result.regions || {})
      : 0;
    return {
      status: 'SUCCESS',
      rowsFetched: result.totalFetched,
      rowsInserted: result.totalInserted,
      rowsUpdated: result.totalUpdated,
      rowsSkipped: 0,
      rowsStale,
      message: result.message,
      details: { regions: result.regions, changed: result.changed },
    };
  },
};