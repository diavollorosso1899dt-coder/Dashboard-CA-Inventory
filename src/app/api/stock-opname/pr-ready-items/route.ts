import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseRequirementItems, getAssetRequests } from '@/lib/supabase/server';
import { extractPrReadyStockItemsForSo } from '@/lib/procurement/pr-history';
import { AssetRequest } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const [prAllItems, { data: allAssetRequests }] = await Promise.all([
      getPurchaseRequirementItems('ALL', true),
      getAssetRequests({ region: 'ALL', limit: 5000, fresh: true }),
    ]);

    const mergedMap = new Map<string, AssetRequest>();
    for (const it of prAllItems || []) {
      if (it?.id) mergedMap.set(it.id, it);
    }
    for (const it of allAssetRequests || []) {
      if (it?.id && !mergedMap.has(it.id)) {
        mergedMap.set(it.id, it);
      }
    }

    const combined = Array.from(mergedMap.values());
    const { items, totalQty } = extractPrReadyStockItemsForSo(combined);

    return NextResponse.json({
      success: true,
      count: items.length,
      totalQty,
      data: items,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal mengambil data PR Ready Stock' },
      { status: 500 }
    );
  }
}

