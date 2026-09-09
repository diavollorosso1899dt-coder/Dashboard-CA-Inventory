import { NextRequest, NextResponse } from 'next/server';
import { getAssetRequests, createAssetRequest } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = (searchParams.get('region') as RegionType) || 'ALL';
    const branch = searchParams.get('branch') || undefined;
    const rabNumber = searchParams.get('rabNumber') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await getAssetRequests({
      region,
      branch,
      rabNumber,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const created = await createAssetRequest(body);
    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create asset' },
      { status: 500 }
    );
  }
}
