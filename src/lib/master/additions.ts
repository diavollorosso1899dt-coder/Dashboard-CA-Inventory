/**
 * Helper murni untuk master asset additions dari RO.
 *
 * Modul ini tidak boleh mengimpor Supabase, React, atau API browser supaya
 * bisa diuji langsung dengan `node --test`.
 */

import { normalizeInventoryKey } from '../so-harian/inventoryEngine.ts';

export type MasterAdditionRegion = 'JABODETABEK' | 'KALBAR';

export interface MasterAdditionInput {
  item_name?: string | null;
  sku?: string | null;
  unit?: string | null;
  classification?: string | null;
  item_type?: string | null;
  specification?: string | null;
  photo_url?: string | null;
  stock_source?: string | null;
}

export interface CatalogEnrichment {
  item_name?: string | null;
  system_item_name?: string | null;
  sku?: string | null;
  unit?: string | null;
  classification?: string | null;
  specification?: string | null;
  photo_url?: string | null;
}

export interface MasterAdditionDraft {
  region: MasterAdditionRegion;
  item_name: string;
  normalized_name: string;
  sku: string | null;
  unit: string;
  classification: string;
  specification: string | null;
  photo_url: string | null;
  source: 'RO';
  source_ro_number: string | null;
  is_active: true;
}

export interface ExistingAdditionLike {
  region?: string | null;
  normalized_name?: string | null;
  sku?: string | null;
}

export interface SessionDetailLike {
  id?: string | null;
  kode_barang?: string | null;
  nama_barang?: string | null;
}

export interface SessionAppendRow {
  id: string;
  session_id: string;
  kode_barang: string;
  nama_barang: string;
  kategori: string;
  satuan: string;
  lokasi: string;
  stok_awal: number;
  qty_penerimaan: number;
  qty_ro: number;
  stok_sistem: number;
  qty_fisik: null;
  selisih: null;
  status_selisih: 'UNCHECKED';
  catatan: string;
}

export interface SoStockItemLike {
  kode_barang?: string | null;
  nama_barang?: string | null;
  stok_sistem?: number | null;
  qty_fisik?: number | null;
  satuan?: string | null;
}

export interface OpeningStockDetailLike {
  nama_barang: string;
  satuan: string;
  lokasi: string;
  kategori: string;
}

export function isCancelledStockSource(value?: string | null): boolean {
  return String(value || '').trim().toUpperCase() === 'CANCELLED';
}

function findCatalogMatch(
  catalog: CatalogEnrichment[],
  normalizedName: string,
  normalizedSku: string
): CatalogEnrichment | null {
  if (normalizedSku) {
    const bySku = catalog.find(
      (row) => normalizeInventoryKey(row.sku) === normalizedSku
    );
    if (bySku) return bySku;
  }

  return (
    catalog.find((row) => {
      const name = normalizeInventoryKey(row.item_name || row.system_item_name);
      return Boolean(name) && name === normalizedName;
    }) || null
  );
}

export function buildMasterAdditionDrafts(options: {
  region: MasterAdditionRegion;
  roNumber?: string | null;
  items?: MasterAdditionInput[];
  catalog?: CatalogEnrichment[];
}): MasterAdditionDraft[] {
  const catalog = options.catalog || [];
  const seenNames = new Set<string>();
  const seenSkus = new Set<string>();
  const drafts: MasterAdditionDraft[] = [];

  for (const item of options.items || []) {
    if (isCancelledStockSource(item.stock_source)) continue;

    const itemName = String(item.item_name || '').trim();
    const normalizedName = normalizeInventoryKey(itemName);
    if (!normalizedName) continue;

    const rawSku = String(item.sku || '').trim();
    const sku = rawSku || null;
    const normalizedSku = normalizeInventoryKey(rawSku);

    if (seenNames.has(normalizedName)) continue;
    if (normalizedSku && seenSkus.has(normalizedSku)) continue;

    const match = findCatalogMatch(catalog, normalizedName, normalizedSku);
    const classification =
      String(
        item.classification || item.item_type || match?.classification || ''
      ).trim() || 'Perlengkapan Tetap';
    const unit = String(item.unit || match?.unit || '').trim() || 'unit';

    seenNames.add(normalizedName);
    if (normalizedSku) seenSkus.add(normalizedSku);

    drafts.push({
      region: options.region,
      item_name: itemName,
      normalized_name: normalizedName,
      sku,
      unit,
      classification,
      specification: match?.specification || item.specification || null,
      photo_url: match?.photo_url || item.photo_url || null,
      source: 'RO',
      source_ro_number: options.roNumber
        ? String(options.roNumber).trim()
        : null,
      is_active: true,
    });
  }

  return drafts;
}

export function selectNewAdditionDrafts(
  drafts: MasterAdditionDraft[],
  existing: ExistingAdditionLike[]
): MasterAdditionDraft[] {
  const rows = existing || [];

  return (drafts || []).filter((draft) => {
    const sameRegion = rows.filter(
      (row) =>
        !row.region ||
        String(row.region).trim().toUpperCase() === draft.region
    );
    const names = new Set(
      sameRegion
        .map((row) => normalizeInventoryKey(row.normalized_name))
        .filter(Boolean)
    );
    const skus = new Set(
      sameRegion.map((row) => normalizeInventoryKey(row.sku)).filter(Boolean)
    );

    if (names.has(draft.normalized_name)) return false;
    const skuKey = normalizeInventoryKey(draft.sku);
    if (skuKey && skus.has(skuKey)) return false;
    return true;
  });
}

function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function buildAutoDetailId(
  sessionId: string,
  itemName: string,
  sku?: string | null
): string {
  const seed = `${normalizeInventoryKey(itemName)}|${normalizeInventoryKey(sku)}`;
  return `${sessionId}-auto-${hashKey(seed)}`;
}

function detailMatchesDraft(
  detail: SessionDetailLike,
  draft: MasterAdditionDraft
): boolean {
  const detailCode = normalizeInventoryKey(detail.kode_barang);
  const detailName = normalizeInventoryKey(detail.nama_barang);
  const skuKey = normalizeInventoryKey(draft.sku);

  if (skuKey && detailCode === skuKey) return true;
  if (detailName && detailName === draft.normalized_name) return true;
  if (detailCode && detailCode === draft.normalized_name) return true;
  return false;
}

/**
 * Baris detail yang sudah tersimpan di sesi dan cocok dengan item tambahan,
 * tetapi tidak dikirim di payload. Baris ini harus dipertahankan apa adanya
 * agar tidak diganti baris auto baru dengan qty 0.
 */
export function selectPersistedAdditionRows<T extends SessionDetailLike>(options: {
  additions: MasterAdditionDraft[];
  persistedDetails?: T[];
  payloadDetails?: SessionDetailLike[];
}): T[] {
  const payload = options.payloadDetails || [];
  const payloadIds = new Set(
    payload
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)
  );
  const seenIds = new Set<string>();
  const rows: T[] = [];

  for (const row of options.persistedDetails || []) {
    const rowId = String(row.id || '').trim();
    if (rowId && (payloadIds.has(rowId) || seenIds.has(rowId))) continue;

    const matched = (options.additions || []).some(
      (draft) =>
        detailMatchesDraft(row, draft) &&
        !payload.some((payloadRow) => detailMatchesDraft(payloadRow, draft))
    );
    if (!matched) continue;

    if (rowId) seenIds.add(rowId);
    rows.push(row);
  }

  return rows;
}

export function planSessionAppend(options: {
  sessionId: string;
  roNumber?: string | null;
  additions: MasterAdditionDraft[];
  existingDetails?: SessionDetailLike[];
}): SessionAppendRow[] {
  const existing = options.existingDetails || [];
  const rows: SessionAppendRow[] = [];

  for (const draft of options.additions || []) {
    if (existing.some((detail) => detailMatchesDraft(detail, draft))) continue;
    if (rows.some((row) => detailMatchesDraft(row, draft))) continue;

    const origin =
      String(draft.source_ro_number || options.roNumber || '').trim() || 'RO';
    const isPeralatan =
      String(draft.classification || '').toLowerCase() === 'peralatan';

    rows.push({
      id: buildAutoDetailId(options.sessionId, draft.item_name, draft.sku),
      session_id: options.sessionId,
      kode_barang: String(draft.sku || draft.item_name).trim(),
      nama_barang: draft.item_name,
      kategori: isPeralatan ? 'Peralatan' : 'Perlengkapan Tetap',
      satuan: draft.unit || 'UNIT',
      lokasi: isPeralatan ? 'Ruang Peralatan' : 'Gedung / Kantor',
      stok_awal: 0,
      qty_penerimaan: 0,
      qty_ro: 0,
      stok_sistem: 0,
      qty_fisik: null,
      selisih: null,
      status_selisih: 'UNCHECKED',
      catatan: `Ditambahkan otomatis dari ${origin}`,
    });
  }

  return rows;
}

export function mergeMasterStockAdditions(options: {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  additions: MasterAdditionDraft[];
}): {
  stock: Map<string, number>;
  details: Map<string, OpeningStockDetailLike>;
  added: number;
} {
  const stock = new Map(options.stock || []);
  const details = new Map(options.details || []);
  const known = new Set<string>();

  const register = (value: unknown) => {
    const key = normalizeInventoryKey(value);
    if (key) known.add(key);
  };

  for (const key of stock.keys()) register(key);
  for (const [key, detail] of details.entries()) {
    register(key);
    register(detail?.nama_barang);
  }

  let added = 0;

  for (const draft of options.additions || []) {
    const skuKey = normalizeInventoryKey(draft.sku);
    if (known.has(draft.normalized_name) || (skuKey && known.has(skuKey))) {
      continue;
    }

    const key = String(draft.sku || draft.item_name).trim();
    if (!key) continue;

    const isPeralatan =
      String(draft.classification || '').toLowerCase() === 'peralatan';

    stock.set(key, 0);
    details.set(key, {
      nama_barang: draft.item_name,
      satuan: draft.unit || 'UNIT',
      lokasi: isPeralatan ? 'Ruang Peralatan' : 'Gedung / Kantor',
      kategori: isPeralatan ? 'Peralatan' : 'Perlengkapan Tetap',
    });

    register(key);
    register(draft.item_name);
    if (skuKey) register(skuKey);
    added += 1;
  }

  return { stock, details, added };
}

function stockItemsMatch(a: SoStockItemLike, b: SoStockItemLike): boolean {
  const codeA = normalizeInventoryKey(a.kode_barang);
  const codeB = normalizeInventoryKey(b.kode_barang);
  const nameA = normalizeInventoryKey(a.nama_barang);
  const nameB = normalizeInventoryKey(b.nama_barang);

  if (codeA && codeB && codeA === codeB) return true;
  if (nameA && nameB && nameA === nameB) return true;
  if (codeA && nameB && codeA === nameB) return true;
  if (codeB && nameA && codeB === nameA) return true;
  return false;
}

export function mergeSoStockWithAdditions(
  items: SoStockItemLike[],
  additions: MasterAdditionDraft[]
): SoStockItemLike[] {
  const result = [...(items || [])];

  for (const draft of additions || []) {
    const candidate: SoStockItemLike = {
      kode_barang: String(draft.sku || draft.item_name).trim(),
      nama_barang: draft.item_name,
      stok_sistem: 0,
      qty_fisik: null,
      satuan: draft.unit || 'UNIT',
    };

    if (result.some((item) => stockItemsMatch(item, candidate))) continue;
    result.push(candidate);
  }

  return result;
}

export function mergeSoStockItemLists<T extends SoStockItemLike>(
  primary: T[],
  secondary: T[]
): T[] {
  const result = [...(primary || [])];

  for (const item of secondary || []) {
    if (result.some((existing) => stockItemsMatch(existing, item))) continue;
    result.push(item);
  }

  return result;
}

export function selectCatalogAdditions(
  catalog: CatalogEnrichment[],
  additions: MasterAdditionDraft[]
): MasterAdditionDraft[] {
  const result: MasterAdditionDraft[] = [];
  const seen = new Set<string>();

  for (const draft of additions || []) {
    if (seen.has(draft.normalized_name)) continue;

    const skuKey = normalizeInventoryKey(draft.sku);
    const exists = (catalog || []).some((item) => {
      const catalogName = normalizeInventoryKey(
        item.item_name || item.system_item_name
      );
      if (catalogName && catalogName === draft.normalized_name) return true;

      const catalogSku = normalizeInventoryKey(item.sku);
      return Boolean(skuKey && catalogSku && skuKey === catalogSku);
    });

    if (exists) continue;
    seen.add(draft.normalized_name);
    result.push(draft);
  }

  return result;
}
