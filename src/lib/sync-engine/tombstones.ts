/**
 * Tombstone: kunci baris yang dihapus manual dan tidak boleh dimasukkan lagi
 * oleh sync Google Sheets.
 *
 * Sebelumnya penanda hapus hanya hidup di memori proses (`__DELETED_RO_KEYS__`),
 * jadi hilang setiap redeploy dan baris yang sudah dihapus bisa muncul kembali.
 * Modul ini memindahkannya ke tabel `sync_tombstones` supaya bertahan.
 *
 * Tabel dibuat oleh `supabase/ro-tombstones.sql`. Kalau tabel belum ada,
 * fungsi di sini mengembalikan daftar kosong dan hanya menulis peringatan —
 * sync tetap berjalan seperti sebelumnya.
 */

export const RO_TOMBSTONE_SOURCE = 'request-orders';

/** Cache singkat supaya sync tidak query tabel ini untuk setiap baris. */
const CACHE_TTL_MS = 30_000;

export interface TombstoneRow {
  id: string;
  source_key: string;
  row_key: string;
  display_key: string | null;
  entity_table: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TombstoneEntry {
  /** Kunci asli, mis. `RO-0005` atau `0005`. Dinormalkan sebelum disimpan. */
  key?: string | null;
  /** Teks yang ditampilkan di UI, biasanya nomor RO lengkap. */
  display?: string | null;
}

interface TombstoneDb {
  // Supabase client; tipe generik agar modul ini tidak mengimpor server.ts
  // (menghindari impor melingkar).
  from(table: string): any;
}

const cache = new Map<string, { keys: Set<string>; at: number }>();

/**
 * Normalkan nomor RO menjadi kunci kanonik: buang prefix `RO`, titik ribuan,
 * dan jadikan huruf kecil. `RO-0005` -> `0005`, `RO-1.458` -> `1458`.
 */
export function canonicalTombstoneKey(raw?: string | null): string {
  if (!raw) return '';
  let id = String(raw).trim().replace(/^RO[-_\s]*/i, '');
  if (/^[\d.]+$/.test(id) && id.includes('.')) {
    id = id.replace(/\./g, '');
  }
  return id.trim().toLowerCase();
}

export function invalidateTombstoneCache(sourceKey?: string): void {
  if (sourceKey) {
    cache.delete(sourceKey);
    return;
  }
  cache.clear();
}

/**
 * Muat daftar kunci yang diblokir. Kalau query gagal, pakai cache lama bila ada
 * supaya sync tidak memasukkan ulang baris yang sudah dihapus.
 */
export async function loadTombstoneKeys(
  db: TombstoneDb | null | undefined,
  sourceKey: string = RO_TOMBSTONE_SOURCE
): Promise<Set<string>> {
  const hit = cache.get(sourceKey);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.keys;
  if (!db) return hit?.keys ?? new Set<string>();

  try {
    const { data, error } = await db
      .from('sync_tombstones')
      .select('row_key')
      .eq('source_key', sourceKey);

    if (error) {
      console.warn('[tombstone] Gagal memuat daftar blokir:', error.message);
      return hit?.keys ?? new Set<string>();
    }

    const keys = new Set<string>(
      (data || [])
        .map((row: any) => canonicalTombstoneKey(row?.row_key))
        .filter((key: string) => Boolean(key))
    );
    cache.set(sourceKey, { keys, at: now });
    return keys;
  } catch (error: any) {
    console.warn('[tombstone] Gagal memuat daftar blokir:', error?.message || error);
    return hit?.keys ?? new Set<string>();
  }
}

/** Simpan kunci hasil hapus manual. Aman kalau kunci yang sama dikirim ulang. */
export async function addTombstones(
  db: TombstoneDb | null | undefined,
  sourceKey: string,
  entries: TombstoneEntry[],
  meta: { reason?: string; createdBy?: string; entityTable?: string } = {}
): Promise<number> {
  if (!db) return 0;

  const unique = new Map<string, string | null>();
  for (const entry of entries) {
    const key = canonicalTombstoneKey(entry.key);
    if (!key) continue;
    const display = (entry.display || entry.key || '').toString().trim() || null;
    if (!unique.has(key) || (!unique.get(key) && display)) {
      unique.set(key, display);
    }
  }
  if (unique.size === 0) return 0;

  const rows = Array.from(unique.entries()).map(([row_key, display_key]) => ({
    source_key: sourceKey,
    row_key,
    display_key,
    entity_table: meta.entityTable || 'request_orders',
    reason: meta.reason || 'Dihapus manual',
    created_by: meta.createdBy || null,
  }));

  try {
    const { error } = await db
      .from('sync_tombstones')
      .upsert(rows, { onConflict: 'source_key,row_key', ignoreDuplicates: true });

    if (error) {
      console.warn('[tombstone] Gagal menyimpan daftar blokir:', error.message);
      return 0;
    }

    invalidateTombstoneCache(sourceKey);
    return rows.length;
  } catch (error: any) {
    console.warn('[tombstone] Gagal menyimpan daftar blokir:', error?.message || error);
    return 0;
  }
}

export async function listTombstones(
  db: TombstoneDb | null | undefined,
  sourceKey: string = RO_TOMBSTONE_SOURCE
): Promise<TombstoneRow[]> {
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('sync_tombstones')
      .select('id, source_key, row_key, display_key, entity_table, reason, created_by, created_at')
      .eq('source_key', sourceKey)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[tombstone] Gagal membaca daftar blokir:', error.message);
      return [];
    }
    return (data || []) as TombstoneRow[];
  } catch (error: any) {
    console.warn('[tombstone] Gagal membaca daftar blokir:', error?.message || error);
    return [];
  }
}

/** Lepas blokir supaya sync berikutnya boleh memasukkan baris itu lagi. */
export async function removeTombstone(
  db: TombstoneDb | null | undefined,
  id: string,
  sourceKey: string = RO_TOMBSTONE_SOURCE
): Promise<boolean> {
  if (!db || !id) return false;
  try {
    const { error } = await db.from('sync_tombstones').delete().eq('id', id);
    if (error) {
      console.warn('[tombstone] Gagal melepas blokir:', error.message);
      return false;
    }
    invalidateTombstoneCache(sourceKey);
    return true;
  } catch (error: any) {
    console.warn('[tombstone] Gagal melepas blokir:', error?.message || error);
    return false;
  }
}