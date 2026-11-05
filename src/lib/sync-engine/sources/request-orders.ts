import type { SyncSource } from '../types.ts';
import { syncRequestOrdersFromSheet } from '@/lib/supabase/server';
import { markRoRowsStale } from '../stale-store.ts';

interface RoSourceOptions {
  clearOldSheetData?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  dateField?: 'order_date' | 'request_date';
}

export const requestOrdersSource: SyncSource = {
  key: 'request-orders',
  label: 'Request Order (JABO + KALBAR)',
  dependsOn: [],
  async run(ctx) {
    const options = (ctx.sourceOptions?.['request-orders'] || {}) as RoSourceOptions;
    const result = await syncRequestOrdersFromSheet({
      ...options,
      dryRun: ctx.dryRun,
    });

    if (!result.success) {
      return {
        status: 'FAILED',
        rowsFetched: result.totalRowsScanned,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: result.duplicateRowsFiltered,
        rowsStale: 0,
        message: result.message,
        details: { regions: result.regions },
      };
    }

    // Sync dengan rentang tanggal hanya membaca sebagian sheet. Baris di luar
    // rentang bukan berarti hilang, jadi jangan ditandai stale.
    const rangeLimited = Boolean(options.startDate || options.endDate);
    const rowsStale =
      ctx.dryRun || rangeLimited
        ? 0
        : await markRoRowsStale(ctx.runStartedAt, result.regions || {});

    return {
      status: 'SUCCESS',
      rowsFetched: result.totalRowsScanned,
      rowsInserted: result.newOrdersAdded,
      rowsUpdated: result.existingOrdersUpdated,
      rowsSkipped: result.duplicateRowsFiltered,
      rowsStale,
      message: result.message,
      details: {
        regions: result.regions,
        changed: result.changed,
        uniqueOrdersCount: result.uniqueOrdersCount,
        rangeLimited,
      },
    };
  },
};