import { NextRequest, NextResponse } from 'next/server';
import { updateAssetRequest, getAssetRequestById, getAdminClient } from '@/lib/supabase/server';
import { moveItemToTrash, recordAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getAdminClient();
    if (!client) {
      return NextResponse.json({ error: 'Supabase client not configured' }, { status: 500 });
    }

    let query = client.from('asset_requests').select('*');
    if (id.includes('-') && id.length === 36) {
      query = query.eq('id', id);
    } else {
      query = query.eq('external_id', id);
    }

    const { data, error } = await query.single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch asset' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Fetch existing asset state before update to support revert / rollback
    const existing = await getAssetRequestById(id);
    const result = await updateAssetRequest(id, body);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 400 });
    }

    // Log update in audit trail with previous_state and new_state
    try {
      const actorName = request.headers.get('x-user-name') || 'User';
      const actorRole = request.headers.get('x-user-role') || 'User';
      const details = Object.entries(body)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      const previousState: Record<string, any> = {};
      if (existing) {
        Object.keys(body).forEach((key) => {
          previousState[key] = (existing as any)[key];
        });
      }

      await recordAuditLog(
        actorName,
        actorRole,
        body.item_delivery_status ? 'STATUS_CHANGE' : 'UPDATE',
        'ASET',
        result.data?.item_name || existing?.item_name || 'Aset',
        `Pembaruan data aset: ${details}`,
        { 
          entityId: id, 
          previousState: Object.keys(previousState).length > 0 ? previousState : undefined,
          newState: body 
        }
      );
    } catch (auditErr) {
      console.error('Failed recording audit log:', auditErr);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update asset' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getAdminClient();
    const actorName = request.headers.get('x-user-name') || 'Super User';
    const actorRole = request.headers.get('x-user-role') || 'Super User';

    let existingAsset: any = null;

    if (client) {
      const { data } = await client
        .from('asset_requests')
        .select('*')
        .eq('id', id)
        .single();
      existingAsset = data;
    }

    const title = existingAsset?.item_name || 'Aset';
    const subtitle = `${existingAsset?.branch_name || 'Cabang'} • ${existingAsset?.rab_number || 'RAB'}`;

    await moveItemToTrash(
      'ASET',
      id,
      title,
      subtitle,
      existingAsset || { id },
      actorName,
      actorRole,
      'Dihapus oleh user dari menu aksi aset'
    );

    if (client) {
      await client.from('asset_requests').delete().eq('id', id);
    }

    return NextResponse.json({
      success: true,
      message: 'Item berhasil dipindahkan ke Tempat Sampah',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Gagal menghapus aset' },
      { status: 500 }
    );
  }
}
