import { NextRequest, NextResponse } from 'next/server';
import { syncRequestOrdersFromSheet, cleanDuplicateRequestOrders, RoSyncResult } from '@/lib/supabase/server';
import { RoDateField } from '@/lib/distribution/ro-date-filter';
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

export async function GET(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }

    const clearOld = req.nextUrl.searchParams.get('clear') === 'true';
    const startDate = req.nextUrl.searchParams.get('startDate') || undefined;
    const endDate = req.nextUrl.searchParams.get('endDate') || undefined;
    const rawField = req.nextUrl.searchParams.get('dateField');
    const dateField: RoDateField = rawField === 'request_date' ? 'request_date' : 'order_date';
    const result = await syncRequestOrdersFromSheet({
      clearOldSheetData: clearOld,
      startDate,
      endDate,
      dateField,
    });
    await logRoSheetSync(req, result);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }

    const clearOld = req.nextUrl.searchParams.get('clear') === 'true';
    let startDate = req.nextUrl.searchParams.get('startDate') || undefined;
    let endDate = req.nextUrl.searchParams.get('endDate') || undefined;
    let rawField = req.nextUrl.searchParams.get('dateField');

    try {
      const body = await req.json();
      if (body) {
        if (body.startDate !== undefined) startDate = body.startDate || undefined;
        if (body.endDate !== undefined) endDate = body.endDate || undefined;
        if (body.dateField !== undefined) rawField = body.dateField;
      }
    } catch {
      // No JSON body provided; query params are used
    }

    const dateField: RoDateField = rawField === 'request_date' ? 'request_date' : 'order_date';
    const result = await syncRequestOrdersFromSheet({
      clearOldSheetData: clearOld,
      startDate,
      endDate,
      dateField,
    });
    await logRoSheetSync(req, result);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
