import { NextRequest, NextResponse } from 'next/server';
import { syncMasterAssetCatalogFromSheet, getMasterAssetCatalog } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await syncMasterAssetCatalogFromSheet();
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
