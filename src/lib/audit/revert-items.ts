/**
 * Logika murni untuk mengembalikan sebagian item RO dari audit log.
 *
 * Audit log RO menyimpan snapshot `previous_state.items` dan `new_state.items`.
 * Saat user memilih item tertentu, hanya field yang berubah pada item itu yang
 * dipulihkan. Item lain dan progres lanjutan pada field yang tidak berubah
 * tetap dipertahankan.
 */
import { stableValue } from './change-summary.ts';

export interface ItemFieldDiff {
  field: string;
  previousValue: unknown;
  currentValue: unknown;
}

export interface ChangedItem {
  /** Kunci stabil untuk pilihan di UI (berbasis id, atau nama item). */
  key: string;
  itemId?: string;
  itemName: string;
  fields: ItemFieldDiff[];
  previousItem: Record<string, any>;
  currentItem: Record<string, any>;
}

export interface MergeRevertedItemsResult {
  items: Record<string, any>[];
  appliedKeys: string[];
  skippedKeys: string[];
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function itemDisplayName(item: Record<string, any>): string {
  const name = String(item.item_name ?? '').trim();
  return name || 'Tanpa nama';
}

function itemKey(item: Record<string, any>): string {
  if (item.id !== null && item.id !== undefined && String(item.id) !== '') {
    return `id:${String(item.id)}`;
  }
  return `name:${normalizeName(item.item_name)}`;
}

function uniqueKey(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let counter = 2;
  while (used.has(`${base}#${counter}`)) counter += 1;
  const key = `${base}#${counter}`;
  used.add(key);
  return key;
}

/**
 * Cari item pasangan di `candidates`: utamakan id yang sama, lalu nama item
 * yang sama. Indeks yang sudah dipakai tidak dicocokkan lagi.
 */
function findMatchIndex(
  item: Record<string, any>,
  candidates: Record<string, any>[],
  used: Set<number>
): number {
  const id = item.id;
  if (id !== null && id !== undefined && String(id) !== '') {
    const byId = candidates.findIndex(
      (candidate, index) =>
        !used.has(index) &&
        candidate.id !== null &&
        candidate.id !== undefined &&
        String(candidate.id) === String(id)
    );
    if (byId !== -1) return byId;
  }

  const name = normalizeName(item.item_name);
  if (!name) return -1;

  return candidates.findIndex(
    (candidate, index) => !used.has(index) && normalizeName(candidate.item_name) === name
  );
}

/**
 * Bandingkan snapshot item sebelum dan sesudah perubahan.
 *
 * Hanya item yang ada di kedua snapshot dan punya minimal satu field berbeda
 * yang dikembalikan. Item yang hanya ada di salah satu snapshot (ditambah atau
 * dihapus) tidak termasuk karena pemulihannya akan mengubah struktur array;
 * kasus itu tetap ditangani oleh "Kembalikan Semua (RO)".
 */
export function diffChangedItems(previousItems: unknown, currentItems: unknown): ChangedItem[] {
  const previous = Array.isArray(previousItems) ? previousItems.filter(isPlainObject) : [];
  const current = Array.isArray(currentItems) ? currentItems.filter(isPlainObject) : [];

  const usedCurrent = new Set<number>();
  const usedKeys = new Set<string>();
  const result: ChangedItem[] = [];

  for (const before of previous) {
    const matchIndex = findMatchIndex(before, current, usedCurrent);
    if (matchIndex === -1) continue;
    usedCurrent.add(matchIndex);

    const after = current[matchIndex];
    const fieldNames = new Set([...Object.keys(before), ...Object.keys(after)]);
    const fields: ItemFieldDiff[] = [];

    for (const field of fieldNames) {
      if (field === 'id') continue;
      const previousValue = before[field] ?? null;
      const currentValue = after[field] ?? null;
      if (stableValue(previousValue) === stableValue(currentValue)) continue;
      fields.push({ field, previousValue, currentValue });
    }

    if (fields.length === 0) continue;

    const name = itemDisplayName(before) !== 'Tanpa nama' ? itemDisplayName(before) : itemDisplayName(after);

    result.push({
      key: uniqueKey(itemKey(before), usedKeys),
      itemId:
        before.id !== null && before.id !== undefined
          ? String(before.id)
          : after.id !== null && after.id !== undefined
            ? String(after.id)
            : undefined,
      itemName: name,
      fields,
      previousItem: before,
      currentItem: after,
    });
  }

  return result;
}

/**
 * Terapkan pemulihan per item ke daftar item RO yang sedang aktif.
 *
 * Hanya field yang tercatat berubah pada log yang ditulis ulang. Field lain
 * pada item yang sama tidak disentuh supaya progres setelah log tetap aman.
 */
export function mergeRevertedItems(
  liveItems: unknown,
  changedItems: ChangedItem[],
  selectedKeys: string[]
): MergeRevertedItemsResult {
  const items = Array.isArray(liveItems)
    ? liveItems.filter(isPlainObject).map((item) => ({ ...item }))
    : [];
  const selected = new Set(selectedKeys);
  const usedLive = new Set<number>();
  const appliedKeys: string[] = [];
  const skippedKeys: string[] = [];

  for (const change of changedItems) {
    if (!selected.has(change.key)) continue;

    const liveIndex = findMatchIndex(change.previousItem, items, usedLive);
    if (liveIndex === -1) {
      skippedKeys.push(change.key);
      continue;
    }

    usedLive.add(liveIndex);
    const liveItem = items[liveIndex];

    for (const diff of change.fields) {
      if (Object.prototype.hasOwnProperty.call(change.previousItem, diff.field)) {
        liveItem[diff.field] = change.previousItem[diff.field] ?? null;
      } else {
        delete liveItem[diff.field];
      }
    }

    appliedKeys.push(change.key);
  }

  return { items, appliedKeys, skippedKeys };
}
