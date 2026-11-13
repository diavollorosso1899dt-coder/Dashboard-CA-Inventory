import { NextRequest, NextResponse } from 'next/server';
import { getRequestOrders, createRequestOrder, updateRequestOrder, deleteRequestOrder, getAdminClient } from '@/lib/supabase/server';
import { sortOrdersNewestFirst } from '@/lib/utils/ro-sorter';
import { isRoFinalizedForActiveList, isStaleUnprocessedSheetRo } from '@/lib/distribution/ro-visibility';
import { auditMutation } from '@/lib/audit/record-change';
import { resolveActor } from '@/lib/auth/actor';

export const dynamic = 'force-dynamic';

/** Judul RO untuk audit log tanpa prefix ganda ("RO RO-1458"). */
function roTitle(roNumber?: string | null, branchName?: string | null): string {
  const num = (roNumber || '').trim();
  const base = !num ? 'RO (baru)' : /^ro[\s-]/i.test(num) ? num : `RO ${num}`;
  return branchName ? `${base} (${branchName})` : base;
}

async function getRoSnapshot(idOrNumber: string): Promise<any | null> {
  const admin = getAdminClient();
  if (!admin || !idOrNumber) return null;
  const byId = /^[0-9a-f-]{36}$/i.test(idOrNumber)
    ? await admin.from('request_orders').select('*').eq('id', idOrNumber).maybeSingle()
    : null;
  if (byId && !byId.error && byId.data) return byId.data;
  const byNumber = await admin
    .from('request_orders')
    .select('*')
    .eq('ro_number', idOrNumber)
    .maybeSingle();
  if (!byNumber.error && byNumber.data) return byNumber.data;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const activeOnly = req.nextUrl.searchParams.get('active') === 'true';
    // Selalu baca DB terbaru: endpoint ini dipakai polling UI, jadi cache
    // instance lain bisa menampilkan status lama setelah user mengubahnya.
    let data = await getRequestOrders(true);
    if (activeOnly) {
      // RO yang sudah dialokasikan ke Ready Stock / PR tetap tampil di
      // Kelola RO. Hanya RO final (selesai/dibatalkan) dan RO sheet yang sudah
      // hilang dari sheet tanpa progres yang disembunyikan.
      data = data.filter(
        (o) => !isRoFinalizedForActiveList(o) && !isStaleUnprocessedSheetRo(o)
      );
    }
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
    const created = await createRequestOrder(body);

    await auditMutation(req, {
      entityType: 'RO',
      entityTitle: roTitle(created?.ro_number || body.ro_number, created?.branch_name || body.branch_name),
      entityId: created?.id,
      next: created,
      details: `Membuat dokumen RO ${created?.ro_number || body.ro_number || ''} untuk cabang ${created?.branch_name || body.branch_name || '-'} (${(created?.items || body.items || []).length} item).`,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, updates } = body;
    const patchData = updates || (status ? { status } : body);
    const targetId = id || patchData?.id || patchData?.ro_number;

    const previous = targetId ? await getRoSnapshot(targetId) : null;
    const ok = await updateRequestOrder(id, patchData);

    if (ok) {
      const merged = previous ? { ...previous, ...patchData } : patchData;
      await auditMutation(req, {
        entityType: 'RO',
        entityTitle: roTitle(
          merged?.ro_number || previous?.ro_number || targetId,
          previous?.branch_name
        ),
        entityId: previous?.id || id,
        previous: previous || undefined,
        next: merged,
      });
    }

    return NextResponse.json({ success: ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');
    const body = await req.json().catch(() => null);
    const targetId = idParam || body?.id || body?.ro_number;
    const reason = String(searchParams.get('reason') || body?.reason || '').trim();

    if (!targetId) {
      return NextResponse.json({ error: 'ID atau nomor RO harus disediakan' }, { status: 400 });
    }

    const previous = await getRoSnapshot(targetId);
    const actor = resolveActor(req);
    const ok = await deleteRequestOrder(targetId, actor.name, reason || undefined);

    if (ok) {
      await auditMutation(req, {
        entityType: 'RO',
        entityTitle: roTitle(previous?.ro_number || targetId, previous?.branch_name),
        entityId: previous?.id || targetId,
        actionType: 'PERMANENT_DELETE',
        details: `Menghapus dokumen RO ${previous?.ro_number || targetId}${previous?.branch_name ? ` (${previous.branch_name})` : ''} secara permanen.${reason ? ` Alasan: ${reason}` : ''}`,
        previousState: previous || undefined,
      });
    }

    return NextResponse.json({ success: ok, message: 'Dokumen RO berhasil dihapus dari aplikasi' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
