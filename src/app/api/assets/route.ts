import { NextRequest, NextResponse } from 'next/server';
import { getAssetRequests } from '@/lib/supabase/server';
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
