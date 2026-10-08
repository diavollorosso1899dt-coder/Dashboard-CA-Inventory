import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleSheetsToSupabase, syncRequestOrdersFromSheet } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const [assetRes, roRes] = await Promise.allSettled([
      syncGoogleSheetsToSupabase({ force }),
      syncRequestOrdersFromSheet(),
    ]);

    const assetData = assetRes.status === 'fulfilled' ? assetRes.value : null;
    const roData = roRes.status === 'fulfilled' ? roRes.value : null;

    const roChanged = Boolean(roData && roData.success && roData.changed);
    const changed = Boolean((assetData && assetData.changed) || roChanged);

    return NextResponse.json({
      ...(assetData || { success: false, totalFetched: 0, totalInserted: 0, totalUpdated: 0, durationMs: 0, message: 'Sync failed' }),
      roSync: roData,
      changed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const [assetRes, roRes] = await Promise.allSettled([
      syncGoogleSheetsToSupabase({ force }),
      syncRequestOrdersFromSheet(),
    ]);

    const assetData = assetRes.status === 'fulfilled' ? assetRes.value : null;
    const roData = roRes.status === 'fulfilled' ? roRes.value : null;

    const roChanged = Boolean(roData && roData.success && roData.changed);
    const changed = Boolean((assetData && assetData.changed) || roChanged);

    return NextResponse.json({
      ...(assetData || { success: false, totalFetched: 0, totalInserted: 0, totalUpdated: 0, durationMs: 0, message: 'Sync failed' }),
      roSync: roData,
      changed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
