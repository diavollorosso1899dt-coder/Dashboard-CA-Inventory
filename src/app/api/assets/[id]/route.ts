import { NextRequest, NextResponse } from 'next/server';
import { updateAssetRequest, getAdminClient } from '@/lib/supabase/server';
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

    const { data, error } = await client
      .from('asset_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

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
    const result = await updateAssetRequest(id, body);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Update failed' }, { status: 400 });
    }

    // Log update in audit trail
    try {
      const actorName = request.headers.get('x-user-name') || 'User';
      const actorRole = request.headers.get('x-user-role') || 'User';
      const details = Object.entries(body)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      await recordAuditLog(
        actorName,
        actorRole,
        'UPDATE',
        'ASET',
        result.data?.item_name || 'Aset',
        `Pembaruan data aset: ${details}`,
        { entityId: id, newState: body }
      );
    } catch {}

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
