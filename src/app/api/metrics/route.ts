import { NextRequest, NextResponse } from 'next/server';
import { calculateDashboardMetrics, getBranchOpeningSummaries } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = (searchParams.get('region') as RegionType) || 'ALL';

    const [metrics, branchSummaries] = await Promise.all([
      calculateDashboardMetrics(region),
      getBranchOpeningSummaries(region),
    ]);

    return NextResponse.json({
      metrics,
      branchSummaries,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to calculate metrics' },
      { status: 500 }
    );
  }
}
