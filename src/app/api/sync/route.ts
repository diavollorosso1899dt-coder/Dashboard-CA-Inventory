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

    const assetData = assetRes.status === 'fulfilled' ? assetRes.value : { success: false, message: assetRes.reason?.message };
    const roData = roRes.status === 'fulfilled' ? roRes.value : { success: false, message: roRes.reason?.message };

    return NextResponse.json({ ...assetData, roSync: roData });
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

    const assetData = assetRes.status === 'fulfilled' ? assetRes.value : { success: false, message: assetRes.reason?.message };
    const roData = roRes.status === 'fulfilled' ? roRes.value : { success: false, message: roRes.reason?.message };

    return NextResponse.json({ ...assetData, roSync: roData });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

