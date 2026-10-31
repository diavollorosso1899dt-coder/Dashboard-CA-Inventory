import { NextRequest, NextResponse } from 'next/server';
import { getRequestOrders, createRequestOrder, updateRequestOrder, deleteRequestOrder } from '@/lib/supabase/server';
import { sortOrdersNewestFirst } from '@/lib/utils/ro-sorter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const activeOnly = req.nextUrl.searchParams.get('active') === 'true';
    // Selalu baca DB terbaru: endpoint ini dipakai polling UI, jadi cache
    // instance lain bisa menampilkan status lama setelah user mengubahnya.
    let data = await getRequestOrders(true);
    if (activeOnly) {
      data = data.filter((o) => {
        if (o.notes && o.notes.includes('[PROCESSED_FROM_RO]')) return false;
        const stage = o.current_stage || o.status;
        if (
          stage === 'SURAT_JALAN' ||
          stage === 'IN_DELIVERY' ||
          stage === 'KELOLA_PR' ||
          stage === 'NEED_PR' ||
          stage === 'READY_STOCK' ||
          stage === 'ASET_SAMPAI' ||
          stage === 'CHECKLIST' ||
          stage === 'CHECKLIST_DONE' ||
          stage === 'UPDATE_SLA' ||
          stage === 'SELESAI' ||
          stage === 'COMPLETED'
        ) {
          return false;
        }
        return true;
      });
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
    const ok = await updateRequestOrder(id, patchData);
    return NextResponse.json({ success: ok });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get('id');
    const body = idParam ? null : await req.json().catch(() => null);
    const targetId = idParam || body?.id || body?.ro_number;

    if (!targetId) {
      return NextResponse.json({ error: 'ID atau nomor RO harus disediakan' }, { status: 400 });
    }

    const ok = await deleteRequestOrder(targetId);
    return NextResponse.json({ success: ok, message: 'Dokumen RO berhasil dihapus dari aplikasi' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
