import { NextRequest, NextResponse } from 'next/server';
import { 
  getSuratJalanList, 
  createSuratJalan, 
  updateSuratJalanStatus, 
  deleteSuratJalan, 
  clearAllSuratJalan 
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getSuratJalanList();
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createSuratJalan(body);
    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      id, 
      status, 
      receiver_name, 
      penerima_nama, 
      signature_url, 
      tanda_tangan_url, 
      photo_url, 
      foto_bukti_url, 
      notes, 
      catatan_penerimaan 
    } = body;
    
    const ok = await updateSuratJalanStatus(id, status, {
      receiverName: receiver_name || penerima_nama,
      signatureUrl: signature_url || tanda_tangan_url,
      photoUrl: photo_url || foto_bukti_url,
      notes: notes || catatan_penerimaan,
    });
    return NextResponse.json({ success: ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const ok = await deleteSuratJalan(id);
      return NextResponse.json({ success: ok, message: `Surat Jalan ${id} berhasil dihapus` });
    }

    const res = await clearAllSuratJalan();
    return NextResponse.json({ 
      success: true, 
      message: `Semua data Surat Jalan berhasil dibersihkan (${res.count} data dihapus)`,
      count: res.count 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

