import { NextRequest, NextResponse } from 'next/server';
import { getAssetTransfers, createAssetTransfer, updateAssetTransfer, clearAllAssetTransfers, deleteAssetTransfer, getAdminClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/audit/audit-store';
import { resolveActor } from '@/lib/auth/actor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getAssetTransfers(true);
    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createAssetTransfer(body);
    const actor = resolveActor(req, { name: body.sender_pic, role: body.sender_role });

    await recordAuditLog(
      actor.name,
      actor.role,
      'CREATE',
      'TRANSFER',
      `Mutasi ${created.transfer_number} (${created.from_location} -> ${created.to_location})`,
      `Penerbitan Surat Jalan ${created.surat_jalan_number} dengan ${created.items?.length || 0} item aset`,
      { entityId: created.id }
    );

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'Transfer ID diperlukan' }, { status: 400 });
    }

    const updated = await updateAssetTransfer(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Data mutasi tidak ditemukan' }, { status: 404 });
    }

    let previous: any = null;
    try {
      const admin = getAdminClient();
      if (admin) {
        const { data } = await admin.from('asset_transfers').select('*').eq('id', id).maybeSingle();
        previous = data;
      }
    } catch {}

    const actor = resolveActor(req, { name: updates.receiver_pic, role: updates.receiver_role });
    await recordAuditLog(
      actor.name,
      actor.role,
      'STATUS_CHANGE',
      'TRANSFER',
      `Konfirmasi / Update Mutasi ${updated.transfer_number}`,
      `Perubahan dokumen transfer. Status: ${updated.status}. Diterima oleh ${updated.receiver_pic || '-'}. Catatan: ${updated.received_notes || '-'}`,
      {
        entityId: id,
        previousState: previous
          ? {
              status: previous.status,
              receiver_pic: previous.receiver_pic,
              received_notes: previous.received_notes,
            }
          : undefined,
        newState: {
          status: updated.status,
          receiver_pic: updated.receiver_pic,
          received_notes: updated.received_notes,
        },
      }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const actor = resolveActor(req);

    if (id) {
      await deleteAssetTransfer(id);
      await recordAuditLog(
        actor.name,
        actor.role,
        'PERMANENT_DELETE',
        'TRANSFER',
        `Hapus Dokumen Transfer ${id}`,
        `Dokumen transfer aset ${id} berhasil dihapus oleh ${actor.name}`,
        { entityId: id }
      );
      return NextResponse.json({ success: true, message: `Dokumen transfer ${id} berhasil dihapus` });
    }

    const result = await clearAllAssetTransfers();

    await recordAuditLog(
      actor.name,
      actor.role,
      'PERMANENT_DELETE',
      'TRANSFER',
      'Bersihkan Seluruh Riwayat Dokumen Pemantauan Transfer Aset',
      `Membersihkan ${result.count} data transfer aset dari database dan cache`,
      { entityId: 'all' }
    );

    return NextResponse.json({ success: true, message: 'Semua data transfer berhasil dibersihkan', result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
