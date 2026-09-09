import { NextResponse } from 'next/server';
import { getDispositionRequests, createDispositionRequest, updateDispositionStatus } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await getDispositionRequests();
    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memuat data disposisi aset' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { outlet_nama, kode_aset, nama_aset, kondisi, alasan, foto_url, diajukan_oleh } = body;

    if (!outlet_nama || !nama_aset || !kondisi || !alasan) {
      return NextResponse.json(
        { success: false, error: 'Outlet, Nama Aset, Kondisi, dan Alasan pengembalian wajib diisi.' },
        { status: 400 }
      );
    }

    const newReq = await createDispositionRequest({
      outlet_nama,
      kode_aset: kode_aset || 'GEN-DISP-' + Math.floor(1000 + Math.random() * 9000),
      nama_aset,
      kondisi,
      alasan,
      foto_url: foto_url || undefined,
      diajukan_oleh: diajukan_oleh || 'Staff Cabang'
    });

    return NextResponse.json({ success: true, data: newReq });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal membuat pengajuan pengembalian aset' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, catatan_admin } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'ID dan status baru wajib disertakan' }, { status: 400 });
    }

    const updated = await updateDispositionStatus(id, status, catatan_admin);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memperbarui status disposisi' }, { status: 500 });
  }
}
