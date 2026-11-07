/**
 * Merge RO hasil spreadsheet dengan RO yang sudah ada di database.
 *
 * Prinsip: data yang sudah ada di aplikasi adalah hasil kerja user (status,
 * tahap, catatan, alokasi stok, item tambahan). Sync hanya boleh menambah
 * data baru, bukan mengembalikan data lama ke kondisi spreadsheet.
 */

type RoLike = Record<string, any>;

const FILL_FROM_SHEET_IF_EMPTY = [
  'ro_number',
  'raw_ro_id',
  'branch_name',
  'region',
  'requester_name',
  'request_date',
  'target_delivery_date',
  'status',
  'current_stage',
  'source_type',
  'warehouse_name',
  'notes',
] as const;

/**
 * Field deskriptif yang bukan hasil kerja user. Spreadsheet tetap menjadi
 * sumber kebenaran, sehingga koreksi outlet/gudang di sheet ikut memperbaiki
 * RO lama (misalnya saat header sheet sempat bergeser).
 */
const SHEET_AUTHORITATIVE_ORDER_FIELDS = [
  'branch_name',
  'warehouse_name',
  'requester_name',
  'region',
  'source_type',
] as const;

/**
 * Field item yang berasal dari sheet. Alokasi stok, qty terpenuhi, dan catatan
 * user tetap dipertahankan.
 */
const SHEET_AUTHORITATIVE_ITEM_FIELDS = [
  'sku',
  'unit',
  'unit_price',
  'total_price',
  'item_type',
] as const;

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function itemHasUserProgress(item: RoLike): boolean {
  const fulfilled = Number(item?.quantity_fulfilled) || 0;
  if (fulfilled > 0) return true;
  return hasValue(item?.stock_source) && item.stock_source !== 'ON_PROSES';
}

function itemKey(item: RoLike): string {
  return String(item?.item_name || '').toLowerCase().trim();
}

function normalizeOwnerRoId(raw: unknown): string {
  if (!raw) return '';
  let id = String(raw).trim().replace(/^RO[-_\s]*/i, '');
  if (/^[\d.]+$/.test(id) && id.includes('.')) {
    id = id.replace(/\./g, '');
  }
  return id.toLowerCase().trim();
}

function isOwnSheetItem(item: RoLike, ownerRawRoId?: string): boolean {
  if (!ownerRawRoId) return false;
  const match = String(item?.id || '').trim().match(/^roi-(.+?)-\d+-\d+$/i);
  if (!match) return false;
  return normalizeOwnerRoId(match[1]) === normalizeOwnerRoId(ownerRawRoId);
}

/**
 * Mengecek apakah item memiliki ID otomatis spreadsheet (`roi-<roId>-<row>-<idx>`)
 * milik nomor RO lain (akibat kebocoran query masa lalu).
 */
export function isForeignSheetRoItem(item: RoLike, ownerRawRoId?: string): boolean {
  if (!ownerRawRoId) return false;
  const cleanOwner = normalizeOwnerRoId(ownerRawRoId);
  if (!cleanOwner) return false;
  const idStr = String(item?.id || '').trim();
  const match = idStr.match(/^roi-(.+?)-\d+-\d+$/i);
  if (!match) return false;
  const itemRoId = normalizeOwnerRoId(match[1]);
  return Boolean(itemRoId && itemRoId !== cleanOwner);
}

/**
 * Semua item lama milik RO ini dipertahankan apa adanya. Item yang memiliki ID
 * `roi-<roId>-*` milik RO lain dibuang. Item dari sheet dipakai untuk
 * melengkapi field yang masih kosong atau menambah item baru.
 *
 * Item yang jelas berasal dari sheet (`roi-<roId>-...`) namun sudah tidak ada
 * di sheet akan dibuang selama belum diproses user, supaya hasil tarik ulang
 * benar-benar mengikuti sheet terbaru. Item manual dan item yang sudah punya
 * progres tetap dipertahankan.
 */
export function mergeRoItemsForSync(
  existingItems: unknown,
  sheetItems: unknown,
  ownerRawRoId?: string
): RoLike[] {
  const existing = Array.isArray(existingItems)
    ? existingItems
        .filter((it) => !isForeignSheetRoItem(it as RoLike, ownerRawRoId))
        .map((it) => ({ ...(it as RoLike) }))
    : [];
  const sheet = Array.isArray(sheetItems) ? (sheetItems as RoLike[]) : [];

  const byId = new Map<string, RoLike>();
  const byName = new Map<string, RoLike>();
  for (const item of existing) {
    if (item?.id) byId.set(String(item.id), item);
    const key = itemKey(item);
    if (key && !byName.has(key)) byName.set(key, item);
  }

  const matchedItems = new Set<RoLike>();

  for (const incoming of sheet) {
    const incomingId = incoming?.id ? String(incoming.id) : '';
    const matched = (incomingId && byId.get(incomingId)) || byName.get(itemKey(incoming));

    if (!matched) {
      const created = { ...incoming };
      existing.push(created);
      matchedItems.add(created);
      continue;
    }

    matchedItems.add(matched);

    // Lengkapi field yang belum ada di data lama; jangan menimpa nilai user.
    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'id') continue;
      if (!hasValue(matched[key]) && hasValue(value)) {
        matched[key] = value;
      }
    }

    // Field deskriptif item mengikuti sheet agar koreksi di spreadsheet
    // (unit, harga, total, tipe) ikut memperbaiki data lama.
    for (const key of SHEET_AUTHORITATIVE_ITEM_FIELDS) {
      if (hasValue(incoming[key])) matched[key] = incoming[key];
    }

    // Nama item dari sheet boleh mengoreksi item yang jelas berasal dari sheet
    // (`roi-<roId>-...`) selama belum diproses user. Item dengan ID lain
    // (misalnya hasil rename/manual) tetap dipertahankan.
    if (
      isOwnSheetItem(matched, ownerRawRoId) &&
      !itemHasUserProgress(matched) &&
      hasValue(incoming.item_name)
    ) {
      matched.item_name = incoming.item_name;
    }

    // Qty pesanan boleh dikoreksi sheet selama item belum diproses user.
    if (!itemHasUserProgress(matched) && hasValue(incoming.quantity_ordered)) {
      matched.quantity_ordered = incoming.quantity_ordered;
    }
  }

  return existing.filter((item) => {
    if (matchedItems.has(item)) return true;
    if (!isOwnSheetItem(item, ownerRawRoId)) return true;
    return itemHasUserProgress(item);
  });
}

export function mergeRoForSync<T extends RoLike>(sheetOrder: T, existing?: RoLike | null): T {
  if (!existing) return sheetOrder;

  const ownerRawRoId =
    normalizeOwnerRoId(sheetOrder.raw_ro_id || sheetOrder.ro_number) ||
    normalizeOwnerRoId(existing.raw_ro_id || existing.ro_number);

  const rawExistingItems = Array.isArray(existing.items) ? (existing.items as RoLike[]) : [];
  const hadForeignItem = rawExistingItems.some((it) => isForeignSheetRoItem(it, ownerRawRoId));

  const merged: RoLike = { ...sheetOrder, ...existing };
  for (const key of FILL_FROM_SHEET_IF_EMPTY) {
    if (!hasValue(merged[key]) && hasValue(sheetOrder[key])) {
      merged[key] = sheetOrder[key];
    }
  }
  for (const key of SHEET_AUTHORITATIVE_ORDER_FIELDS) {
    if (hasValue(sheetOrder[key])) merged[key] = sheetOrder[key];
  }

  merged.id = existing.id;
  merged.items = mergeRoItemsForSync(existing.items, sheetOrder.items, ownerRawRoId);

  // Jika RO sebelumnya tercemar item PR_VENDOR dari RO lain dan seluruh item
  // aslinya masih ON_PROSES, kembalikan status/tahap ke kondisi awal.
  if (
    hadForeignItem &&
    (merged.current_stage === 'KELOLA_PR' || merged.status === 'NEED_PR') &&
    Array.isArray(merged.items) &&
    merged.items.length > 0 &&
    merged.items.every((it: RoLike) => !it.stock_source || it.stock_source === 'ON_PROSES')
  ) {
    merged.status = sheetOrder.status || 'INPUT_SYSTEM';
    merged.current_stage = sheetOrder.current_stage || 'REQUEST_ORDER';
  }

  return merged as T;
}