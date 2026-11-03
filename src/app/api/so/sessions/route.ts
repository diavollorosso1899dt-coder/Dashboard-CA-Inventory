import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Penyimpanan sesi Stock Opname Harian ke Supabase.
 *
 * Tabel `so_sessions` & `so_details` memakai RLS yang menolak INSERT dari anon
 * key, sehingga penulisan langsung dari browser selalu gagal (42501). Route ini
 * menulis memakai service role di server, jadi data tetap tersimpan tanpa
 * membuka akses tulis ke publik.
 */

const BATCH_SIZE = 300;

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Koneksi Supabase tidak tersedia.' }, { status: 500 });
    }

    const body = await req.json();
    const session = body?.session;
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    if (!session?.id) {
      return NextResponse.json({ success: false, error: 'Parameter session.id wajib disertakan.' }, { status: 400 });
    }

    const sessionId = String(session.id);
    const now = new Date().toISOString();
    const sessionPayload = {
      id: sessionId,
      tanggal: session.tanggal || now.slice(0, 10),
      gudang: session.gudang ?? null,
      petugas: session.petugas ?? null,
      total_items: items.length,
      item_match: items.filter((i) => i.status_selisih === 'MATCH').length,
      item_minus: items.filter((i) => i.status_selisih === 'MINUS').length,
      item_plus: items.filter((i) => i.status_selisih === 'PLUS').length,
      item_selisih:
        items.filter((i) => i.status_selisih === 'MINUS').length +
        items.filter((i) => i.status_selisih === 'PLUS').length,
      akurasi_persen: toNumberOrNull(session.akurasi_persen),
      status: session.status || 'DRAFT',
      updated_at: now,
      created_at: session.created_at || now,
    };

    const { error: sessionError } = await admin.from('so_sessions').upsert(sessionPayload);
    if (sessionError) throw new Error(sessionError.message);

    if (items.length > 0) {
      const detailPayload = items.map((i) => ({
        id: String(i.id),
        session_id: sessionId,
        kode_barang: i.kode_barang ?? '',
        nama_barang: i.nama_barang ?? null,
        kategori: i.kategori || 'Peralatan',
        satuan: i.satuan ?? null,
        stok_awal: toNumberOrNull(i.stok_awal),
        qty_penerimaan: toNumberOrNull(i.qty_penerimaan),
        qty_ro: toNumberOrNull(i.qty_ro),
        stok_sistem: toNumberOrNull(i.stok_sistem),
        qty_fisik: toNumberOrNull(i.qty_fisik),
        selisih: toNumberOrNull(i.selisih),
        status_selisih: i.status_selisih ?? null,
        catatan: i.catatan ?? null,
        updated_at: now,
      }));

      for (let idx = 0; idx < detailPayload.length; idx += BATCH_SIZE) {
        const chunk = detailPayload.slice(idx, idx + BATCH_SIZE);
        const { error: detailError } = await admin.from('so_details').upsert(chunk);
        if (detailError) throw new Error(detailError.message);
      }

      // Hapus detail yang sudah tidak ada di sesi (mis. item dikeluarkan user)
      // agar data cloud sama persis dengan yang terakhir disimpan.
      const keepIds = new Set(detailPayload.map((d) => d.id));
      const { data: existing, error: existingError } = await admin
        .from('so_details')
        .select('id')
        .eq('session_id', sessionId);
      if (existingError) throw new Error(existingError.message);

      const staleIds = (existing || []).map((row: any) => row.id).filter((id: string) => !keepIds.has(id));
      for (let idx = 0; idx < staleIds.length; idx += BATCH_SIZE) {
        const chunk = staleIds.slice(idx, idx + BATCH_SIZE);
        const { error: staleError } = await admin.from('so_details').delete().in('id', chunk);
        if (staleError) throw new Error(staleError.message);
      }
    }

    return NextResponse.json({ success: true, sessionId, itemCount: items.length });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menyimpan sesi Stock Opname.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Koneksi Supabase tidak tersedia.' }, { status: 500 });
    }

    const sessionId = req.nextUrl.searchParams.get('id');
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Parameter id wajib disertakan.' }, { status: 400 });
    }

    const { error: detailError } = await admin.from('so_details').delete().eq('session_id', sessionId);
    if (detailError) throw new Error(detailError.message);

    const { error: sessionError } = await admin.from('so_sessions').delete().eq('id', sessionId);
    if (sessionError) throw new Error(sessionError.message);

    return NextResponse.json({ success: true, sessionId });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menghapus sesi Stock Opname.' },
      { status: 500 }
    );
  }
}