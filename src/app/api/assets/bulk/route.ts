import { NextRequest, NextResponse } from 'next/server';
import { updateAssetRequestsBulk, getAdminClient } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';
import { formatValue } from '@/lib/audit/change-summary';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;
    if (!Array.isArray(ids) || ids.length === 0 || !updates) {
      return NextResponse.json(
        { error: 'Invalid payload. An array of "ids" and an "updates" object are required.' },
        { status: 400 }
      );
    }

    const result = await updateAssetRequestsBulk(ids, updates);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Bulk update failed' }, { status: 500 });
    }

    try {
      const admin = getAdminClient();
      let previousRows: any[] = [];
      if (admin) {
        const { data } = await admin.from('asset_requests').select('*').in('id', ids);
        previousRows = data || [];
      }
      const changed = Object.entries(updates)
        .map(([key, value]) => `${key}: ${formatValue(key, value)}`)
        .join(', ');
      const isStatusChange = Object.keys(updates).some((key) =>
        ['status', 'item_delivery_status', 'procurement_status', 'stock_status'].includes(key)
      );
      await auditMutation(request, {
        entityType: 'ASET',
        entityTitle: `Update massal ${ids.length} aset`,
        entityId: ids.join(','),
        actionType: isStatusChange ? 'STATUS_CHANGE' : 'UPDATE',
        details: `Mengubah ${ids.length} aset sekaligus (${changed}).`,
        previousState: previousRows.length > 0
          ? previousRows.map((row) => ({
              id: row.id,
              item_name: row.item_name,
              ...Object.fromEntries(Object.keys(updates).map((key) => [key, row[key]])),
            }))
          : undefined,
        newState: { ids, updates },
      });
    } catch (auditErr) {
      console.error('Failed recording bulk audit log:', auditErr);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to perform bulk update' },
      { status: 500 }
    );
  }
}
