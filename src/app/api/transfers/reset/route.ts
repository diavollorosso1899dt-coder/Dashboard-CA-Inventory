import { NextResponse } from 'next/server';
import { clearAllAssetTransfers, resetAllSystemTransfers } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const transferResult = await clearAllAssetTransfers();
    const systemTransferResult = await resetAllSystemTransfers();

    await recordAuditLog(
      'Administrator',
      'Manajemen Sampah & Log',
      'PERMANENT_DELETE',
      'TRANSFER',
      'Reset Total Pemantauan Transfer Aset',
      `Menghapus ${transferResult.count} dokumen mutasi dan me-reset ${systemTransferResult.resetCount} checklist Role Transfer menjadi 0`,
      { entityId: 'full_reset' }
    );

    return NextResponse.json({
      success: true,
      message: 'Seluruh data transfer dan checklist Role Transfer berhasil di-reset menjadi 0',
      transferResult,
      systemTransferResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
