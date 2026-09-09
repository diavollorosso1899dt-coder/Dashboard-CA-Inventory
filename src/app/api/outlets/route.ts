import { NextResponse } from 'next/server';
import { getOutlets, saveOutlet } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const outlets = await getOutlets();
    return NextResponse.json({ success: true, data: outlets });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memuat data outlet' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nama, region, alamat, pic_nama, telepon, status, target_opening } = body;

    if (!nama || !region) {
      return NextResponse.json({ success: false, error: 'Nama Outlet dan Region wajib diisi.' }, { status: 400 });
    }

    const saved = await saveOutlet({
      id: body.id || undefined,
      nama,
      region,
      alamat: alamat || '',
      pic_nama: pic_nama || '',
      telepon: telepon || '',
      status: status || 'Aktif',
      target_opening: target_opening || null
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menyimpan data outlet' }, { status: 500 });
  }
}
