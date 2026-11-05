import { NextRequest, NextResponse } from 'next/server';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { cleanDuplicateRequestOrders, type RoSyncResult } from '@/lib/supabase/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

/** Catat ringkasan sync hanya bila ada data yang benar-benar berubah. */
async function logRoSheetSync(req: NextRequest, result: RoSyncResult): Promise<void> {
  if (!result?.success || !result.changed) return;
  try {
    await auditMutation(req, {
      entityType: 'RO',
      entityTitle: 'Sinkronisasi RO dari Google Sheets',
      actionType: 'UPDATE',
      details: `Sinkronisasi sheet: ${result.newOrdersAdded} RO baru, ${result.existingOrdersUpdated} RO diperbarui (${result.totalRowsScanned} baris dipindai, ${result.duplicateRowsFiltered} baris duplikat diabaikan).`,
      newState: {
        newOrdersAdded: result.newOrdersAdded,
        existingOrdersUpdated: result.existingOrdersUpdated,
        uniqueOrdersCount: result.uniqueOrdersCount,
      },
    });
  } catch (err) {
    console.error('[audit] Gagal mencatat sinkronisasi RO:', err);
  }
}

async function runRo(req: NextRequest, body?: any) {
  if (!isSyncRequestAllowed(req)) {
    return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
  }

  const clearOld = req.nextUrl.searchParams.get('clear') === 'true';
  const startDate = body?.startDate ?? req.nextUrl.searchParams.get('startDate') ?? undefined;
  const endDate = body?.endDate ?? req.nextUrl.searchParams.get('endDate') ?? undefined;
  const dateField = body?.dateField ?? req.nextUrl.searchParams.get('dateField') ?? 'order_date';

  const result = await runSync(
    {
      sources: ['request-orders'],
      trigger: 'MANUAL',
      sourceOptions: {
        'request-orders': {
          clearOldSheetData: clearOld,
          startDate,
          endDate,
          dateField: dateField === 'request_date' ? 'request_date' : 'order_date',
        },
      },
    },
    { store: new SupabaseSyncStore(), sources: SYNC_SOURCES }
  );

  const ro = result.sources.find((s) => s.key === 'request-orders');
  const mapped: RoSyncResult = {
    success: ro?.status === 'SUCCESS',
    totalRowsScanned: ro?.rowsFetched || 0,
    duplicateRowsFiltered: ro?.rowsSkipped || 0,
    uniqueOrdersCount: Number(ro?.details?.uniqueOrdersCount) || 0,
    newOrdersAdded: ro?.rowsInserted || 0,
    existingOrdersUpdated: ro?.rowsUpdated || 0,
    changed: result.changed,
    message: ro?.message || result.message,
    regions: ro?.details?.regions as RoSyncResult['regions'],
    dryRun: result.dryRun,
  };

  await logRoSheetSync(req, mapped);
  return NextResponse.json(mapped);
}

export async function GET(req: NextRequest) {
  return runRo(req);
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return runRo(req, body);
}

export async function DELETE() {
  try {
    const res = await cleanDuplicateRequestOrders();
    return NextResponse.json({
      success: true,
      ...res,
      message: `Berhasil membersihkan ${res.cleanedCount} entri RO duplikat. Total RO unik sekarang: ${res.totalUnique}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}