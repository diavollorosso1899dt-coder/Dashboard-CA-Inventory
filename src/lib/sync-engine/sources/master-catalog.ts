import type { SyncSource } from '../types.ts';
import { syncMasterAssetCatalogFromSheet } from '@/lib/supabase/server';

export const masterCatalogSource: SyncSource = {
  key: 'master-catalog',
  label: 'Master Katalog Item',
  dependsOn: ['asset-requests'],
  async run(ctx) {
    const result = await syncMasterAssetCatalogFromSheet({ dryRun: ctx.dryRun });
    return {
      status: result.success ? 'SUCCESS' : 'FAILED',
      rowsFetched: result.totalItems,
      rowsInserted: 0,
      rowsUpdated: ctx.dryRun ? 0 : result.totalItems,
      rowsSkipped: 0,
      rowsStale: 0,
      message: result.message,
      details: { classifications: result.classifications, dryRun: ctx.dryRun },
    };
  },
};