import { NextRequest, NextResponse } from 'next/server';
import { getPurchaseRequirementHistory } from '@/lib/supabase/server';
import { extractPrReadyStockItemsForSo } from '@/lib/procurement/pr-history';
import { normalizeSoRegion } from '@/lib/so-harian/region';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = normalizeSoRegion(searchParams.get('region'));
    const sinceDate = searchParams.get('sinceDate');

    // Sumber Data Penerimaan Harian: Riwayat PR. Qty yang dipakai adalah
    // quantity_pr (fallback quantity_needed) dari item PR yang sudah selesai /
    // Ready Stock, sehingga angka penerimaan selalu berasal dari PR.
    const historyItems = await getPurchaseRequirementHistory(region || 'ALL');
    const { items, totalQty } = extractPrReadyStockItemsForSo(historyItems, { sinceDate });

    return NextResponse.json({
      success: true,
      region: region || 'ALL',
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

