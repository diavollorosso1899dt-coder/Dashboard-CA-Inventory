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

/**
 * Semua item lama dipertahankan apa adanya. Item dari sheet hanya dipakai
 * untuk melengkapi field yang masih kosong atau menambah item baru.
 */
export function mergeRoItemsForSync(existingItems: unknown, sheetItems: unknown): RoLike[] {
  const existing = Array.isArray(existingItems) ? existingItems.map((it) => ({ ...(it as RoLike) })) : [];
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

  const merged: RoLike = { ...sheetOrder, ...existing };
  for (const key of FILL_FROM_SHEET_IF_EMPTY) {
    if (!hasValue(merged[key]) && hasValue(sheetOrder[key])) {
      merged[key] = sheetOrder[key];
    }
  }

  merged.id = existing.id;
  merged.items = mergeRoItemsForSync(existing.items, sheetOrder.items);
  return merged as T;
}