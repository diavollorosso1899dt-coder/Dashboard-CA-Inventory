import { NextRequest, NextResponse } from 'next/server';
import { getAssetTransfers, createAssetTransfer, updateAssetTransfer, clearAllAssetTransfers } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getAssetTransfers();
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createAssetTransfer(body);

    await recordAuditLog(
      body.sender_pic || 'Staff SCGA',
      'Super User',
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

    await recordAuditLog(
      updates.receiver_pic || 'Staff Outlet',
      'outlet_manager',
      'STATUS_CHANGE',
      'TRANSFER',
      `Konfirmasi Penerimaan Mutasi ${updated.transfer_number}`,
      `Status diubah ke ${updated.status}. Diterima oleh ${updated.receiver_pic || '-'} pada ${updated.received_date || '-'}. Catatan: ${updated.received_notes || '-'}`,
      { entityId: id }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await clearAllAssetTransfers();

    await recordAuditLog(
      'Administrator',
      'Manajemen Sampah & Log',
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
