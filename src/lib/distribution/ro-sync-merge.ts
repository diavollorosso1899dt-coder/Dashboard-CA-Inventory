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

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
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

  for (const incoming of sheet) {
    const incomingId = incoming?.id ? String(incoming.id) : '';
    const matched = (incomingId && byId.get(incomingId)) || byName.get(itemKey(incoming));

    if (!matched) {
      existing.push({ ...incoming });
      continue;
    }

    // Lengkapi field yang belum ada di data lama; jangan menimpa nilai user.
    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'id') continue;
      if (!hasValue(matched[key]) && hasValue(value)) {
        matched[key] = value;
      }
    }
  }

  return existing;
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