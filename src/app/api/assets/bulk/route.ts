import { NextRequest, NextResponse } from 'next/server';
import { updateAssetRequestsBulk } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;
    if (!Array.isArray(ids) || ids.length === 0 || !updates) {
      return NextResponse.json(
        { error: 'Invalid payload. An array of "ids" and an "updates" object are required.' },
        { status: 400 }
      );
    }

    const result = await updateAssetRequestsBulk(ids, updates);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Bulk update failed' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to perform bulk update' },
      { status: 500 }
    );
  }
}
