import { NextRequest, NextResponse } from 'next/server';
import { syncMasterAssetCatalogFromSheet, getMasterAssetCatalog } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await syncMasterAssetCatalogFromSheet();

    if (result.success && result.totalItems > 0) {
      try {
        await auditMutation(req, {
          entityType: 'ITEM',
          entityTitle: 'Sinkronisasi Katalog Item dari Google Sheets',
          actionType: 'UPDATE',
          details: `Sinkronisasi master item: ${result.totalItems} item terbaca dari sheet (${result.classifications?.length || 0} klasifikasi).`,
          newState: { totalItems: result.totalItems },
        });
      } catch (auditErr) {
        console.error('[audit] Gagal mencatat sinkronisasi katalog item:', auditErr);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const data = await getMasterAssetCatalog();
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
