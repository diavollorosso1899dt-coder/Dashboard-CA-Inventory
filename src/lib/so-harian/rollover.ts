/**
 * Rollover stok antar hari untuk SO Harian.
 *
 * Aturan bisnis:
 * - Master / Spreadsheet hanya dipakai sebagai stok awal pertama kali
 *   (atau saat user sengaja melakukan reset).
 * - Setelah hari pertama, hasil SO hari sebelumnya menjadi acuan stok awal
 *   hari berikutnya: qty fisik bila sudah dihitung, stok sistem bila belum.
 * - Master tetap dipakai untuk melengkapi SKU baru yang belum ada di hasil SO.
 */

import type { SOItem } from './inventoryEngine';

export type OpeningStockSource = 'SO_SEBELUMNYA' | 'MASTER' | 'MANUAL';

export interface CarryForwardEntry {
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  satuan: string;
  lokasi: string;
  qty: number;
  /** true bila qty berasal dari hitung fisik; false bila memakai stok sistem. */
  counted: boolean;
}

export interface SessionLike {
  id: string;
  tanggal?: string | null;
  status?: string | null;
}

export interface OpeningStockDetail {
  nama_barang: string;
  kategori: string;
  satuan: string;
  lokasi: string;
}

export interface MergedOpeningStock {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetail>;
  sources: Map<string, OpeningStockSource>;
  stats: { fromPrevious: number; fromMaster: number; total: number };
}

/** Ambil bagian YYYY-MM-DD dari string tanggal apa pun (ISO, lokal, dsb). */
export function normalizeSessionDate(value?: string | null): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return localDateString(parsed);
}

/** Tanggal hari ini menurut zona waktu perangkat, bukan UTC. */
export function localDateString(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Pilih sesi SO terakhir yang tanggalnya SEBELUM tanggal SO yang sedang dikerjakan.
 * Sesi di hari yang sama tidak pernah dipakai agar rollover tidak memutar
 * hasil hari itu sendiri.
 */
export function pickPreviousSession<T extends SessionLike>(
  sessions: T[] = [],
  currentDate?: string | null
): T | null {
  const cutoff = normalizeSessionDate(currentDate) || localDateString();
  const candidates = (sessions || [])
    .map((session) => ({ session, date: normalizeSessionDate(session?.tanggal) }))
    .filter((entry): entry is { session: T; date: string } => Boolean(entry.date) && entry.date! < cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));

  return candidates[0]?.session || null;
}

/** Ringkas hasil SO menjadi stok awal untuk hari berikutnya. */
export function buildCarryForwardEntries(items: SOItem[] = []): Map<string, CarryForwardEntry> {
  const entries = new Map<string, CarryForwardEntry>();

  for (const item of items || []) {
    if (!item) continue;
    const code = String(item.kode_barang || '').trim();
    if (!code) continue;

    const fisikRaw = item.qty_fisik;
    const counted =
      fisikRaw !== null &&
      fisikRaw !== undefined &&
      String(fisikRaw).trim() !== '' &&
      Number.isFinite(Number(fisikRaw));

    const qty = counted ? Number(fisikRaw) : Number(item.stok_sistem) || 0;
    const rounded = Math.round((qty + Number.EPSILON) * 10000) / 10000;

    entries.set(code, {
      kode_barang: code,
      nama_barang: item.nama_barang || code,
      kategori: item.kategori || 'Peralatan',
      satuan: item.satuan || 'PCS',
      lokasi: item.lokasi || 'Gudang Utama',
      qty: rounded,
      counted,
    });
  }

  return entries;
}

/**
 * Gabungkan master (spreadsheet) dengan hasil SO sebelumnya.
 *
 * `preferCarryForward = true`  -> hasil SO menang untuk SKU yang sama,
 *                                 master hanya menambah SKU baru.
 * `preferCarryForward = false` -> master menang (reset / hari pertama),
 *                                 hasil SO hanya mengisi SKU yang tidak ada di master.
 */
export function mergeOpeningStock(options: {
  master?: Map<string, number>;
  masterDetails?: Map<string, OpeningStockDetail>;
  carryForward?: Map<string, CarryForwardEntry>;
  preferCarryForward?: boolean;
}): MergedOpeningStock {
  const master = options.master || new Map<string, number>();
  const masterDetails = options.masterDetails || new Map<string, OpeningStockDetail>();
  const carryForward = options.carryForward || new Map<string, CarryForwardEntry>();
  const preferCarryForward = options.preferCarryForward !== false;

  const stock = new Map<string, number>();
  const details = new Map<string, OpeningStockDetail>();
  const sources = new Map<string, OpeningStockSource>();
  let fromPrevious = 0;
  let fromMaster = 0;

  const allCodes = new Set<string>([...master.keys(), ...carryForward.keys()]);

  for (const code of allCodes) {
    const masterQty = master.get(code);
    const carry = carryForward.get(code);
    const hasMaster = masterQty !== undefined;
    const hasCarry = carry !== undefined;

    let qty = 0;
    let source: OpeningStockSource;

    if (hasCarry && (!hasMaster || preferCarryForward)) {
      qty = carry!.qty;
      source = 'SO_SEBELUMNYA';
      fromPrevious += 1;
    } else {
      qty = Number(masterQty) || 0;
      source = 'MASTER';
      fromMaster += 1;
    }

    stock.set(code, qty);
    sources.set(code, source);

    const masterDetail = masterDetails.get(code);
    if (masterDetail) {
      details.set(code, {
        nama_barang: masterDetail.nama_barang || carry?.nama_barang || code,
        kategori: masterDetail.kategori || carry?.kategori || 'Peralatan',
        satuan: masterDetail.satuan || carry?.satuan || 'PCS',
        lokasi: masterDetail.lokasi || carry?.lokasi || 'Gudang Utama',
      });
    } else if (carry) {
      details.set(code, {
        nama_barang: carry.nama_barang,
        kategori: carry.kategori,
        satuan: carry.satuan,
        lokasi: carry.lokasi,
      });
    }
  }

  return {
    stock,
    details,
    sources,
    stats: { fromPrevious, fromMaster, total: allCodes.size },
  };
}