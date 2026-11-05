import { NextRequest, NextResponse } from 'next/server';
import { SupabaseSyncStore } from '@/lib/sync-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const raw = Number(req.nextUrl.searchParams.get('limit') || 20);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 100) : 20;
    const store = new SupabaseSyncStore();
    const runs = await store.getHistory(limit);
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message }, { status: 500 });
  }
}