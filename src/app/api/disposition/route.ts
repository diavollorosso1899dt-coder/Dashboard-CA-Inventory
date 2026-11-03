import { NextResponse } from 'next/server';
import { getDispositionRequests, createDispositionRequest, updateDispositionStatus, getAdminClient } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

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

    try {
      await auditMutation(req, {
        entityType: 'DISPOSISI',
        entityTitle: `Disposisi ${newReq?.disposition_number || newReq?.kode_aset || nama_aset}`,
        entityId: newReq?.id,
        next: newReq,
        details: `Mengajukan pengembalian aset "${nama_aset}" dari outlet ${outlet_nama} dengan kondisi ${kondisi}.`,
      });
    } catch (auditErr) {
      console.error('Failed recording disposition audit log:', auditErr);
    }

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
    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan status disposisi ke database. Silakan coba lagi.' },
        { status: 500 }
      );
    }

    try {
      let previous: any = null;
      const admin = getAdminClient();
      if (admin) {
        const { data } = await admin.from('disposition_requests').select('*').eq('id', id).maybeSingle();
        previous = data;
      }
      await auditMutation(req, {
        entityType: 'DISPOSISI',
        entityTitle: `Disposisi ${previous?.disposition_number || id}`,
        entityId: id,
        previous: previous
          ? { status: previous.status, approval_notes: previous.approval_notes, approved_by: previous.approved_by }
          : undefined,
        next: { status, approval_notes: catatan_admin },
        actionType: 'STATUS_CHANGE',
        details: `Memperbarui status disposisi ${previous?.disposition_number || id} menjadi ${status}${catatan_admin ? ` (catatan: ${catatan_admin})` : ''}.`,
      });
    } catch (auditErr) {
      console.error('Failed recording disposition status audit log:', auditErr);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memperbarui status disposisi' }, { status: 500 });
  }
}
