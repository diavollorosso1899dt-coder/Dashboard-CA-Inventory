import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { normalizeSoRegion, resolveSessionRegion } from '@/lib/so-harian/region';
import {
  mergeSoStockWithAdditions,
  type MasterAdditionDraft,
} from '@/lib/master/additions';

export const dynamic = 'force-dynamic';

/**
 * Stok sistem dari sesi Stock Opname Harian terbaru untuk satu region.
 *
 * Dipakai modal "Pilih Proses" di Kelola RO. Dibaca lewat server (service role)
 * supaya tetap tersedia di perangkat yang belum pernah mengatur koneksi
 * Supabase pada modul SO Harian (konfigurasi SO disimpan di localStorage).
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, session: null, items: [] });
    }

    const { searchParams } = new URL(req.url);
    const region = normalizeSoRegion(searchParams.get('region'));

    let additions: MasterAdditionDraft[] = [];
    if (region) {
      try {
        const { data, error } = await admin
          .from('master_asset_additions')
          .select(
            'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active'
          )
          .eq('region', region)
          .eq('is_active', true);

        if (!error && data) additions = data as MasterAdditionDraft[];
      } catch (err) {
        console.warn('[so/stock] Gagal membaca master tambahan:', err);
      }
    }

    let sessions: any[] | null = null;

    const withRegion = admin
      .from('so_sessions')
      .select('id,tanggal,gudang,status,total_items,region')
      .order('tanggal', { ascending: false })
      .limit(region ? 20 : 5);

    const firstAttempt = region ? await withRegion.eq('region', region) : await withRegion;

    if (!firstAttempt.error) {
      sessions = firstAttempt.data;
    } else {
      // Kolom region belum ada (migration belum dijalankan). Ambil lebih banyak
      // baris lalu filter dari ID sesi.
      const fallback = await admin
        .from('so_sessions')
        .select('id,tanggal,gudang,status,total_items')
        .order('tanggal', { ascending: false })
        .limit(50);
      if (fallback.error) throw new Error(fallback.error.message);
      sessions = fallback.data;
    }

    const candidates = (sessions || []).filter(
      (session) => !region || resolveSessionRegion(session) === region
    );

    for (const session of candidates) {
      const items: any[] = [];
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: chunk, error: chunkErr } = await admin
          .from('so_details')
          .select('kode_barang,nama_barang,stok_sistem,qty_fisik,satuan')
          .eq('session_id', session.id)
          .order('kode_barang')
          .range(from, from + PAGE_SIZE - 1);
        if (chunkErr) throw new Error(chunkErr.message);
        if (!chunk || chunk.length === 0) break;
        items.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
      }

      const mergedItems = mergeSoStockWithAdditions(items, additions);
      if (mergedItems.length > 0) {
        return NextResponse.json({
          success: true,
          session,
          items: mergedItems,
        });
      }
    }

    return NextResponse.json({
      success: true,
      session: candidates[0] ?? null,
      items: mergeSoStockWithAdditions([], additions),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat stok SO.' },
      { status: 500 }
    );
  }
}
