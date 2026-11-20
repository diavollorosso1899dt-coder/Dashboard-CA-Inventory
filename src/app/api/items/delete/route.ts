import { NextRequest, NextResponse } from 'next/server';
import { deleteMasterAssetItem } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const itemName = String(body?.itemName || '').trim();
    if (!itemName) {
      return NextResponse.json({ success: false, error: 'Nama item harus diisi.' }, { status: 400 });
    }

    const result = await deleteMasterAssetItem(itemName);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[API deleteMasterAssetItem error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal menghapus item dari Master Aset.' },
      { status: 500 }
    );
  }
}
