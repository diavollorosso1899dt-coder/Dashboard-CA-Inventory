import { NextRequest, NextResponse } from 'next/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { getMasterAssetCatalog } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }

    const result = await runSync(
      { sources: ['master-catalog'], trigger: 'MANUAL' },
      { store: new SupabaseSyncStore(), sources: SYNC_SOURCES }
    );
    const master = result.sources.find((s) => s.key === 'master-catalog');

    if (master?.status === 'SUCCESS') {
      try {
        await auditMutation(req, {
          entityType: 'ITEM',
          entityTitle: 'Sinkronisasi Katalog Item dari Google Sheets',
          actionType: 'UPDATE',
          details: `Sinkronisasi master item: ${master.rowsFetched} item terbaca dari sheet.`,
          newState: { totalItems: master.rowsFetched },
        });
      } catch (auditErr) {
        console.error('[audit] Gagal mencatat sinkronisasi katalog item:', auditErr);
      }
    }

    return NextResponse.json({
      success: master?.status === 'SUCCESS',
      totalItems: master?.rowsFetched || 0,
      message: master?.message || result.message,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const data = await getMasterAssetCatalog();
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}