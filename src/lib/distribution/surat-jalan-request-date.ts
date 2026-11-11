import { getRoDateByField, normalizeIsoDateOnly } from './ro-date-filter.ts';

/**
 * Tanggal "Tgl Permintaan" pada Surat Jalan mengikuti kolom yang sama di
 * TransferAssetView/RO: target_delivery_date lebih dulu, lalu request_date,
 * lalu created_at. Nilainya dinormalisasi ke `YYYY-MM-DD` agar mudah
 * diformat menjadi `DD/MM/YYYY`.
 */
export interface RoRequestDateRow {
  id: string;
  ro_number?: string | null;
  request_date?: string | null;
  target_delivery_date?: string | null;
  created_at?: string | null;
}

export interface RoRequestDateIndex {
  byId: Map<string, string>;
  byNumber: Map<string, string>;
}

export interface SuratJalanItemDateSource {
  asset_id?: string | null;
  notes?: string | null;
  catatan?: string | null;
  tgl_permintaan?: string | null;
  request_date?: string | null;
  target_delivery_date?: string | null;
}

export interface SuratJalanDateSourceDoc {
  items?: SuratJalanItemDateSource[] | null;
}

export interface RoReferences {
  ids: string[];
  numbers: string[];
}

const RO_ID_IN_ASSET_ID =
  /^ro-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-|$)/i;

/** Normalisasi nomor RO agar `RO-0001`, `RO 0001`, dan `0001` saling cocok. */
function normalizeRoNumberKey(value?: string | null): string | null {
  const text = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!text) return null;

  const withoutPrefix = text.replace(/^RO[\s\-/]*/i, '');
  return withoutPrefix ? `RO-${withoutPrefix}` : text;
}

/** Mengambil UUID RO dari `asset_id` berformat `ro-{uuid}-roi-...`. */
export function extractRoIdFromAssetId(assetId?: string | null): string | null {
  const match = String(assetId ?? '').trim().match(RO_ID_IN_ASSET_ID);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Mengambil nomor RO dari catatan item, mis. `No. RO: RO-103863 • Pemohon: ...`.
 * Catatan lama kadang hanya memuat `RO: 103863`.
 */
export function extractRoNumberFromNotes(notes?: string | null): string | null {
  const text = String(notes ?? '');
  const match = text.match(/\bRO(?=[\s:\-/])(?:[\s:\-/]+)([A-Z0-9][A-Z0-9/-]*)\b/i);
  if (!match) return null;

  return normalizeRoNumberKey(match[1].replace(/^RO[\s\-/]*/i, ''));
}

/** Menentukan tanggal permintaan efektif milik satu RO. */
export function resolveRoRequestDate(
  ro: RoRequestDateRow | null | undefined
): string | null {
  if (!ro) return null;
  return (
    getRoDateByField(ro, 'request_date') ||
    normalizeIsoDateOnly(ro.created_at)
  );
}

/** Indeks tanggal RO berdasarkan UUID dan nomor RO untuk pencarian item. */
export function buildRoRequestDateIndex(
  rows: RoRequestDateRow[] | null | undefined
): RoRequestDateIndex {
  const index: RoRequestDateIndex = {
    byId: new Map<string, string>(),
    byNumber: new Map<string, string>(),
  };

  for (const row of rows ?? []) {
    if (!row?.id) continue;
    const date = resolveRoRequestDate(row);
    if (!date) continue;

    index.byId.set(row.id.trim().toLowerCase(), date);

    const numberKey = normalizeRoNumberKey(row.ro_number);
    if (numberKey) index.byNumber.set(numberKey, date);
  }

  return index;
}

/**
 * Resolusi tanggal per item:
 * 1. field tanggal eksplisit pada item (bila nanti API sudah mengirimkannya),
 * 2. UUID RO yang tertanam pada `asset_id`,
 * 3. nomor RO pada `notes`/`catatan`,
 * 4. `null` bila tidak ada referensi RO (UI menampilkan `-`).
 */
export function resolveItemRequestDate(
  item: SuratJalanItemDateSource | null | undefined,
  index: RoRequestDateIndex | null | undefined
): string | null {
  if (!item) return null;

  const explicit =
    normalizeIsoDateOnly(item.tgl_permintaan) ||
    normalizeIsoDateOnly(item.request_date) ||
    normalizeIsoDateOnly(item.target_delivery_date);
  if (explicit) return explicit;

  if (!index) return null;

  const roId = extractRoIdFromAssetId(item.asset_id);
  if (roId) {
    const byId = index.byId.get(roId);
    if (byId) return byId;
  }

  const roNumber = extractRoNumberFromNotes(
    [item.notes, item.catatan].filter(Boolean).join(' ')
  );
  if (roNumber) {
    const byNumber = index.byNumber.get(roNumber);
    if (byNumber) return byNumber;
  }

  return null;
}

/** Mengumpulkan referensi RO dari dokumen yang akan dicetak agar request tanggal terarah. */
export function collectRoReferences(
  docs: SuratJalanDateSourceDoc[] | null | undefined
): RoReferences {
  const ids = new Set<string>();
  const numbers = new Set<string>();

  for (const doc of docs ?? []) {
    for (const item of doc?.items ?? []) {
      const roId = extractRoIdFromAssetId(item?.asset_id);
      if (roId) ids.add(roId);

      const roNumber = extractRoNumberFromNotes(
        [item?.notes, item?.catatan].filter(Boolean).join(' ')
      );
      if (roNumber) numbers.add(roNumber);
    }
  }

  return { ids: Array.from(ids), numbers: Array.from(numbers) };
}
