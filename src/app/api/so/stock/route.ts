import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Stok sistem dari sesi Stock Opname Harian terbaru.
 *
 * Dipakai modal "Pilih Proses" di Kelola RO. Dibaca lewat server (service role)
 * supaya tetap tersedia di perangkat yang belum pernah mengatur koneksi
 * Supabase pada modul SO Harian (konfigurasi SO disimpan di localStorage).
 */
export async function GET() {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, session: null, items: [] });
    }

    const { data: sessions, error } = await admin
      .from('so_sessions')
      .select('id,tanggal,gudang,status,total_items')
      .order('tanggal', { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);

    for (const session of sessions || []) {
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

      if (items.length > 0) {
        return NextResponse.json({ success: true, session, items });
      }
    }

    return NextResponse.json({ success: true, session: sessions?.[0] ?? null, items: [] });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat stok SO Harian.' },
      { status: 500 }
    );
  }
}