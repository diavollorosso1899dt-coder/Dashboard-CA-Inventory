import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { RO_TOMBSTONE_SOURCE, removeTombstone } from '@/lib/sync-engine/tombstones';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSyncRequestAllowed(req)) {
    return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'ID blokir wajib diisi' }, { status: 400 });
    }

    const admin = getAdminClient();
    const ok = await removeTombstone(admin, id, RO_TOMBSTONE_SOURCE);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: 'Blokir tidak ditemukan atau gagal dilepas' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Blokir dilepas. RO ini akan masuk lagi pada sync berikutnya.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Gagal melepas blokir' },
      { status: 500 }
    );
  }
}