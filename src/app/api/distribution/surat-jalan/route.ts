import { NextRequest, NextResponse } from 'next/server';
import {
  getSuratJalanList, 
  createSuratJalan, 
  updateSuratJalanStatus, 
  deleteSuratJalan, 
  clearAllSuratJalan,
  getAdminClient
} from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getSuratJalanList(true);
    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createSuratJalan(body);

    await auditMutation(req, {
      entityType: 'SURAT_JALAN',
      entityTitle: `Surat Jalan ${created?.sj_number || body.sj_number || '(baru)'}`,
      entityId: created?.id,
      next: created,
      details: `Menerbitkan Surat Jalan ${created?.sj_number || body.sj_number || ''} untuk ${created?.branch_name || body.branch_name || '-'} (${(created?.items || body.items || []).length} item).`,
    });

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
      ids,
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

    const targetIds: string[] = Array.isArray(ids) && ids.length > 0
      ? ids.filter(Boolean)
      : id
        ? [id]
        : [];

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'ID Surat Jalan diperlukan' }, { status: 400 });
    }
    
    const ok = await updateSuratJalanStatus(targetIds, status, {
      receiverName: receiver_name || penerima_nama,
      signatureUrl: signature_url || tanda_tangan_url,
      photoUrl: photo_url || foto_bukti_url,
      notes: notes || catatan_penerimaan,
    });

    if (ok) {
      try {
        const admin = getAdminClient();
        let previousRows: any[] = [];
        if (admin) {
          const { data } = await admin.from('surat_jalan').select('*').in('id', targetIds);
          previousRows = data || [];
        }
        const nomor = previousRows.map((row) => row.sj_number).filter(Boolean).join(', ');
        await auditMutation(req, {
          entityType: 'SURAT_JALAN',
          entityTitle: `Surat Jalan ${nomor || targetIds.join(', ')}`,
          entityId: targetIds.join(','),
          actionType: 'STATUS_CHANGE',
          details: `Memperbarui Surat Jalan ${nomor || targetIds.join(', ')}: status → ${status || '(tidak berubah)'}${receiver_name || penerima_nama ? `, penerima: ${receiver_name || penerima_nama}` : ''}.`,
          previousState: previousRows.map((row) => ({
            id: row.id,
            sj_number: row.sj_number,
            status: row.status,
            receiver_name: row.receiver_name,
            notes: row.notes,
          })),
          newState: {
            status,
            receiver_name: receiver_name || penerima_nama,
            notes: notes || catatan_penerimaan,
          },
        });
      } catch (auditErr) {
        console.error('Failed recording surat jalan audit log:', auditErr);
      }
    }

    return NextResponse.json({ success: ok, updatedIds: targetIds });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      let previous: any = null;
      try {
        const admin = getAdminClient();
        if (admin) {
          const { data } = await admin.from('surat_jalan').select('*').eq('id', id).maybeSingle();
          previous = data;
        }
      } catch {}
      const ok = await deleteSuratJalan(id);
      if (ok) {
        await auditMutation(req, {
          entityType: 'SURAT_JALAN',
          entityTitle: `Surat Jalan ${previous?.sj_number || id}`,
          entityId: id,
          actionType: 'PERMANENT_DELETE',
          details: `Menghapus Surat Jalan ${previous?.sj_number || id}${previous?.branch_name ? ` (${previous.branch_name})` : ''}.`,
          previousState: previous || undefined,
        });
      }
      return NextResponse.json({ success: ok, message: `Surat Jalan ${id} berhasil dihapus` });
    }

    const res = await clearAllSuratJalan();
    try {
      await auditMutation(req, {
        entityType: 'SURAT_JALAN',
        entityTitle: 'Semua Surat Jalan',
        actionType: 'PERMANENT_DELETE',
        details: `Membersihkan seluruh data Surat Jalan (${res.count} dokumen dihapus).`,
        previousState: { deleted_count: res.count },
      });
    } catch (auditErr) {
      console.error('Failed recording surat jalan clear audit log:', auditErr);
    }
    return NextResponse.json({ 
      success: true, 
      message: `Semua data Surat Jalan berhasil dibersihkan (${res.count} data dihapus)`,
      count: res.count 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
