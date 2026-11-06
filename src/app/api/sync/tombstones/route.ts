import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { RO_TOMBSTONE_SOURCE, listTombstones } from '@/lib/sync-engine/tombstones';

export const dynamic = 'force-dynamic';

/** Daftar RO yang diblokir agar tidak masuk lagi dari Google Sheet. */
export async function GET(req: NextRequest) {
  if (!isSyncRequestAllowed(req)) {
    return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
  }

  try {
    const admin = getAdminClient();
    const tombstones = await listTombstones(admin, RO_TOMBSTONE_SOURCE);
    return NextResponse.json({ success: true, tombstones });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Gagal memuat daftar blokir' },
      { status: 500 }
    );
  }
}