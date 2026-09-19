import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { moveItemToTrash } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, actorName, actorRole } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: 'Daftar ID tidak valid' }, { status: 400 });
    }

    const client = getAdminClient();
    let deletedCount = 0;

    for (const id of ids) {
      let existingAsset: any = null;
      if (client) {
        const { data } = await client.from('asset_requests').select('*').eq('id', id).single();
        existingAsset = data;
      }

      const title = existingAsset?.item_name || `Aset #${id}`;
      const subtitle = `${existingAsset?.branch_name || ''} • ${existingAsset?.rab_number || ''}`;

      await moveItemToTrash(
        'ASET',
        id,
        title,
        subtitle,
        existingAsset || { id },
        actorName || 'Super User',
        actorRole || 'Super User',
        'Penghapusan massal oleh user'
      );

      if (client) {
        await client.from('asset_requests').delete().eq('id', id);
      }
      deletedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `${deletedCount} item berhasil dipindahkan ke Tempat Sampah`,
      count: deletedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
