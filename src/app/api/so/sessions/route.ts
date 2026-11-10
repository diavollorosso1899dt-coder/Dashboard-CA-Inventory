import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { normalizeSoRegion, resolveSessionRegion } from '@/lib/so-harian/region';
import {
  planSessionAppend,
  selectPersistedAdditionRows,
  type MasterAdditionDraft,
  type SessionAppendRow,
} from '@/lib/master/additions';

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
const DETAIL_PAGE_SIZE = 1000;

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
    const region =
      normalizeSoRegion(session.region) ||
      resolveSessionRegion({ region: session.region, id: sessionId });

    let persistedDetails: any[] = [];
    let persistedDetailsLoaded = false;
    if (region) {
      try {
        for (let from = 0; ; from += DETAIL_PAGE_SIZE) {
          const { data, error } = await admin
            .from('so_details')
            .select('*')
            .eq('session_id', sessionId)
            .order('kode_barang')
            .order('id')
            .range(from, from + DETAIL_PAGE_SIZE - 1);
          if (error) throw new Error(error.message);
          if (!data || data.length === 0) break;
          persistedDetails.push(...data);
          if (data.length < DETAIL_PAGE_SIZE) break;
        }
        persistedDetailsLoaded = true;
      } catch (err) {
        console.warn(
          '[so/sessions] Gagal membaca detail sesi tersimpan:',
          err
        );
      }
    }

    let preservedRows: SessionAppendRow[] = [];
    let persistedAdditionRows: any[] = [];
    if (region && persistedDetailsLoaded) {
      try {
        const { data, error } = await admin
          .from('master_asset_additions')
          .select(
            'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active'
          )
          .eq('region', region)
          .eq('is_active', true);

        if (!error && data) {
          const sessionStatus = String(session.status || 'DRAFT').toUpperCase();
          if (sessionStatus === 'IN_PROGRESS') {
            const additions = data as MasterAdditionDraft[];
            const payloadDetails = items.map((item) => ({
              id: item?.id,
              kode_barang: item?.kode_barang,
              nama_barang: item?.nama_barang,
            }));

            preservedRows = planSessionAppend({
              sessionId,
              additions,
              existingDetails: [
                ...payloadDetails,
                ...persistedDetails.map((row) => ({
                  id: row?.id,
                  kode_barang: row?.kode_barang,
                  nama_barang: row?.nama_barang,
                })),
              ],
            });

            persistedAdditionRows = selectPersistedAdditionRows({
              additions,
              persistedDetails,
              payloadDetails,
            });
          }
        }
      } catch (err) {
        console.warn(
          '[so/sessions] Gagal mempertahankan item master tambahan:',
          err
        );
      }
    }

    const finalItems = [
      ...items,
      ...persistedAdditionRows,
      ...preservedRows,
    ];

    const sessionPayload: any = {
      id: sessionId,
      region,
      tanggal: session.tanggal || now.slice(0, 10),
      gudang: session.gudang ?? null,
      petugas: session.petugas ?? null,
      total_items: finalItems.length,
      item_match: finalItems.filter((i) => i.status_selisih === 'MATCH').length,
      item_minus: finalItems.filter((i) => i.status_selisih === 'MINUS').length,
      item_plus: finalItems.filter((i) => i.status_selisih === 'PLUS').length,
      item_selisih:
        finalItems.filter((i) => i.status_selisih === 'MINUS').length +
        finalItems.filter((i) => i.status_selisih === 'PLUS').length,
      akurasi_persen: toNumberOrNull(session.akurasi_persen),
      status: session.status || 'DRAFT',
      updated_at: now,
      created_at: session.created_at || now,
    };

    let { error: sessionError } = await admin.from('so_sessions').upsert(sessionPayload);

    if (
      sessionError &&
      /region/i.test(sessionError.message || '') &&
      /(column|schema cache)/i.test(sessionError.message || '')
    ) {
      console.warn(
        '[so/sessions] Kolom region belum ada. Menyimpan tanpa region; jalankan supabase/so-region.sql.'
      );
      const fallbackPayload = { ...sessionPayload };
      delete fallbackPayload.region;
      ({ error: sessionError } = await admin.from('so_sessions').upsert(fallbackPayload));
    }

    if (sessionError) throw new Error(sessionError.message);

    if (finalItems.length > 0) {
      const detailPayload = finalItems.map((i) => ({
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

      // Hapus detail yang sudah tidak ada di sesi (mis. item dikeluarkan user).
      // Item tambahan dari master sengaja dipertahankan (spec §7.4): item yang
      // berasal dari RO akan muncul lagi agar master stok SO tetap lengkap.
      //
      // Sweep hanya dijalankan saat client mengirim snapshot item yang nyata.
      // Payload kosong tidak boleh dianggap "hapus semua detail" karena sesi
      // yang belum termuat di perangkat akan kehilangan seluruh detailnya.
      if (items.length > 0) {
        let existingRows: any[] = persistedDetails;
        if (!persistedDetailsLoaded) {
          const { data: existing, error: existingError } = await admin
            .from('so_details')
            .select('id')
            .eq('session_id', sessionId);
          if (existingError) throw new Error(existingError.message);
          existingRows = existing || [];
        }

        const keepIds = new Set(detailPayload.map((d) => d.id));
        const staleIds = existingRows
          .map((row: any) => row.id)
          .filter((id: string) => !keepIds.has(id));
        for (let idx = 0; idx < staleIds.length; idx += BATCH_SIZE) {
          const chunk = staleIds.slice(idx, idx + BATCH_SIZE);
          const { error: staleError } = await admin.from('so_details').delete().in('id', chunk);
          if (staleError) throw new Error(staleError.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      itemCount: finalItems.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menyimpan sesi Stock Opname.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      const sessionId = req.nextUrl.searchParams.get('id');
      return NextResponse.json(
        sessionId ? { success: true, session: null, items: [] } : { success: true, sessions: [] }
      );
    }

    const sessionId = req.nextUrl.searchParams.get('id');
    if (sessionId) {
      const { data, error } = await admin
        .from('so_sessions')
        .select('*')
        .eq('id', sessionId)
        .limit(1);
      if (error) throw new Error(error.message);

      const session = (data || [])[0] ?? null;
      if (!session) {
        return NextResponse.json({ success: true, session: null, items: [] });
      }

      const includeItems = req.nextUrl.searchParams.get('includeItems') !== 'false';
      if (!includeItems) {
        return NextResponse.json({ success: true, session, items: [] });
      }

      const items: any[] = [];
      for (let from = 0; ; from += DETAIL_PAGE_SIZE) {
        const { data: chunk, error: chunkError } = await admin
          .from('so_details')
          .select('*')
          .eq('session_id', sessionId)
          .order('kode_barang')
          .range(from, from + DETAIL_PAGE_SIZE - 1);
        if (chunkError) throw new Error(chunkError.message);
        if (!chunk || chunk.length === 0) break;
        items.push(...chunk);
        if (chunk.length < DETAIL_PAGE_SIZE) break;
      }

      return NextResponse.json({ success: true, session, items });
    }

    const region = normalizeSoRegion(req.nextUrl.searchParams.get('region'));

    let data: any[] | null = null;
    const query = region
      ? admin
          .from('so_sessions')
          .select('*')
          .eq('region', region)
          .order('tanggal', { ascending: false })
      : admin.from('so_sessions').select('*').order('tanggal', { ascending: false });

    const firstAttempt = await query;
    if (!firstAttempt.error) {
      data = firstAttempt.data;
    } else {
      // Kolom region belum ada (migration belum dijalankan). Filter dari ID/tanggal.
      const fallback = await admin
        .from('so_sessions')
        .select('*')
        .order('tanggal', { ascending: false });
      if (fallback.error) throw new Error(fallback.error.message);
      data = (fallback.data || []).filter(
        (session: any) => !region || resolveSessionRegion(session) === region
      );
    }

    return NextResponse.json({ success: true, sessions: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat sesi Stock Opname.' },
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