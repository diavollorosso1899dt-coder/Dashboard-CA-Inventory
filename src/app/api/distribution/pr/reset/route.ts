import { NextResponse } from 'next/server';
import { clearAllPurchaseRequirements } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await clearAllPurchaseRequirements();

    await recordAuditLog(
      'Administrator',
      'Purchase Requirement',
      'PERMANENT_DELETE',
      'ASET',
      'Reset Data PR & Riwayat PR',
      `Menghapus ${result.deletedAssetRequestsCount} baris data asset_requests dan me-reset ${result.resetRoItemsCount} item PR Request Order`,
      { entityId: 'full_pr_reset' }
    );

    return NextResponse.json({
      message: 'Seluruh data PR & Riwayat PR berhasil dikosongkan.',
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
