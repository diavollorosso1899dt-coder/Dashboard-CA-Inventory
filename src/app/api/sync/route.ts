import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleSheetsToSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const result = await syncGoogleSheetsToSupabase({ force });
    return NextResponse.json(result);
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
    const result = await syncGoogleSheetsToSupabase({ force });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
