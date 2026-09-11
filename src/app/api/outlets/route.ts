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
    const nama = (body.nama || body.branch_name || '').trim();
    const region = body.region || 'JABODETABEK';

    if (!nama) {
      return NextResponse.json({ success: false, error: 'Nama Outlet wajib diisi.' }, { status: 400 });
    }

    const saved = await saveOutlet({
      id: body.id || undefined,
      branch_name: nama,
      nama,
      region,
      address: body.alamat || body.address || '',
      alamat: body.alamat || body.address || '',
      pic_name: body.pic_nama || body.pic_name || '',
      pic_nama: body.pic_nama || body.pic_name || '',
      pic_phone: body.telepon || body.pic_phone || '',
      telepon: body.telepon || body.pic_phone || '',
      status: body.status || 'Aktif',
      target_opening_date: body.target_opening || body.target_opening_date || null,
      target_opening: body.target_opening || body.target_opening_date || null,
      notes: body.notes || '',
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Gagal menyimpan data outlet' }, { status: 500 });
  }
}
