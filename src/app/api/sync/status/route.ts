import { NextResponse } from 'next/server';
import { SupabaseSyncStore } from '@/lib/sync-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = new SupabaseSyncStore();
    const running = await store.findRunning();
    const data = await store.getStatus();
    return NextResponse.json({ success: true, running, ...(data as object) });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message }, { status: 500 });
  }
}