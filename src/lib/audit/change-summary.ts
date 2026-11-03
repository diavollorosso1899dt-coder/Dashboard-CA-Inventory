/**
 * Ringkasan perubahan data untuk audit trail.
 *
 * Dipakai API server sebelum/sesudah update agar log mencatat field apa saja
 * yang berubah, nilai sebelumnya, dan nilai barunya.
 */

const IGNORED_KEYS = new Set(['id', 'created_at', 'updated_at', 'is_manually_edited']);

const FIELD_LABELS: Record<string, string> = {
  ro_number: 'No. RO',
  raw_ro_id: 'ID RO Sheet',
  branch_name: 'Cabang',
  region: 'Region',
  requester_name: 'Pemohon',
  request_date: 'Tanggal Permintaan',
  target_delivery_date: 'Target Kirim',
  status: 'Status',
  current_stage: 'Tahap',
  source_type: 'Sumber Data',
  warehouse_name: 'Gudang',
  notes: 'Catatan',
  item_name: 'Nama Item',
  quantity_ordered: 'Qty Pesan',
  quantity_fulfilled: 'Qty Terpenuhi',
  quantity_needed: 'Qty Dibutuhkan',
  stock_source: 'Status Alokasi',
  unit: 'Satuan',
  specification: 'Spesifikasi',
  item_delivery_status: 'Status Distribusi',
  procurement_status: 'Status Pengadaan',
  stock_status: 'Status Stok',
  pic_receiver: 'PIC Penerima',
  received_date: 'Tanggal Diterima',
  pr_datetime: 'Tanggal PR',
  po_date: 'Tanggal PO',
  order_datetime: 'Tanggal Order',
  vendor_name: 'Vendor',
  rab_number: 'No. RAB',
  rab_price: 'Harga RAB',
  deal_price: 'Harga Deal',
  target_opening_date: 'Target Opening',
  pic_name: 'PIC Outlet',
  pic_phone: 'Telepon PIC',
  address: 'Alamat',
  is_active: 'Status Aktif',
  full_name: 'Nama Lengkap',
  role: 'Role',
  password: 'Kata Sandi',
  outlet_assigned: 'Outlet',
  allowed_region: 'Region Akses',
  allowed_features: 'Fitur Akses',
  items: 'Item',
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  stock_source: {
    ON_PROSES: 'On Proses',
    GUDANG_SCGA: 'Ready Stock (Gudang SCGA)',
    PR_VENDOR: 'Butuh PR Vendor',
    CANCELLED: 'Dibatalkan',
  },
  action: {
    ON_PROSES: 'On Proses',
    GUDANG_SCGA: 'Ready Stock',
    PR_VENDOR: 'Butuh PR',
    CANCELLED: 'Dibatalkan',
  },
  procurement_status: {
    proses: 'Proses',
    selesai: 'Selesai',
    belum: 'Belum',
  },
  status: {
    INPUT_SYSTEM: 'Input Sistem',
    READY_STOCK: 'Ready Stock',
    NEED_PR: 'Butuh PR',
    IN_DELIVERY: 'Dalam Pengiriman',
    COMPLETED: 'Selesai',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
  },
};

export interface ChangeSummary {
  changedKeys: string[];
  details: string;
  statusChanged: boolean;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] || key;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Serialisasi deterministik supaya urutan key JSONB tidak dianggap perubahan. */
export function stableValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableValue((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(kosong)';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (Array.isArray(value)) {
    if (key === 'items' || key === 'allowed_features') return `${value.length} data`;
    return `${value.length} data`;
  }
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
  const text = String(value);
  const mapped = VALUE_LABELS[key]?.[text];
  if (mapped) return mapped;
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function itemKey(item: any): string {
  if (item?.id) return `id:${item.id}`;
  return `name:${String(item?.item_name || '').toLowerCase().trim()}`;
}

const ITEM_COMPARE_FIELDS = [
  'item_name',
  'quantity_ordered',
  'quantity_fulfilled',
  'stock_source',
  'unit',
  'notes',
  'specification',
] as const;

/** Ringkas perubahan pada array items RO: item baru, item hilang, field berubah. */
export function summarizeItemChanges(previousItems: unknown, nextItems: unknown): string {
  const previous = Array.isArray(previousItems) ? previousItems.filter(isPlainObject) : [];
  const next = Array.isArray(nextItems) ? nextItems.filter(isPlainObject) : [];

  const previousByKey = new Map<string, any>();
  for (const item of previous) previousByKey.set(itemKey(item), item);

  const nextKeys = new Set<string>();
  const parts: string[] = [];

  for (const item of next) {
    const key = itemKey(item);
    nextKeys.add(key);
    const before = previousByKey.get(key);

    if (!before) {
      parts.push(`+ item "${item.item_name || 'Tanpa nama'}"`);
      continue;
    }

    const changed = ITEM_COMPARE_FIELDS.filter(
      (field) => stableValue(before[field] ?? null) !== stableValue(item[field] ?? null)
    );
    if (changed.length === 0) continue;

    const detail = changed
      .map(
        (field) =>
          `${labelFor(field)}: ${formatValue(field, before[field])} \u2192 ${formatValue(field, item[field])}`
      )
      .join(', ');
    parts.push(`Item "${item.item_name || before.item_name || 'Tanpa nama'}" (${detail})`);
  }

  for (const item of previous) {
    if (!nextKeys.has(itemKey(item))) {
      parts.push(`- item "${item.item_name || 'Tanpa nama'}" dihapus`);
    }
  }

  return parts.join('; ');
}

/** True bila status alokasi salah satu item berubah. */
export function itemStatusChanged(previousItems: unknown, nextItems: unknown): boolean {
  const previous = Array.isArray(previousItems) ? previousItems.filter(isPlainObject) : [];
  const next = Array.isArray(nextItems) ? nextItems.filter(isPlainObject) : [];
  const previousByKey = new Map<string, any>();
  for (const item of previous) previousByKey.set(itemKey(item), item);

  for (const item of next) {
    const before = previousByKey.get(itemKey(item));
    if (before && stableValue(before.stock_source ?? null) !== stableValue(item.stock_source ?? null)) {
      return true;
    }
  }
  return false;
}

/**
 * Bandingkan objek sebelumnya dengan data patch/terbaru.
 * Hanya field yang benar-benar berubah yang masuk ke log.
 */
export function summarizeChanges(previous: unknown, next: unknown): ChangeSummary {
  const before = isPlainObject(previous) ? previous : {};
  const after = isPlainObject(next) ? next : {};

  const changedKeys: string[] = [];
  const details: string[] = [];
  let statusChanged = false;
  const previousState: Record<string, any> = {};
  const newState: Record<string, any> = {};

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue;
    if (!(key in after)) continue;

    if (stableValue(before[key] ?? null) === stableValue(after[key] ?? null)) continue;

    changedKeys.push(key);
    previousState[key] = before[key] ?? null;
    newState[key] = after[key] ?? null;

    if (key === 'items') {
      const itemDetail = summarizeItemChanges(before.items, after.items);
      details.push(itemDetail || 'Item: urutan/isi berubah');
      if (itemStatusChanged(before.items, after.items)) statusChanged = true;
      continue;
    }

    if (
      ['status', 'current_stage', 'procurement_status', 'item_delivery_status', 'stock_status'].includes(key)
    ) {
      statusChanged = true;
    }

    details.push(
      `${labelFor(key)}: ${formatValue(key, before[key])} \u2192 ${formatValue(key, after[key])}`
    );
  }

  return {
    changedKeys,
    details: details.join('; '),
    statusChanged,
    previousState: changedKeys.length > 0 ? previousState : undefined,
    newState: changedKeys.length > 0 ? newState : undefined,
  };
}

/**
 * Tentukan tipe aksi audit dari perubahan yang terjadi.
 */
export function inferActionType(
  previous: unknown,
  summary: { changedKeys?: string[]; statusChanged?: boolean } | string[]
): 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' {
  if (previous === null || previous === undefined) return 'CREATE';
  if (Array.isArray(summary)) {
    return summary.some((key) =>
      ['status', 'current_stage', 'procurement_status', 'item_delivery_status', 'stock_status', 'items'].includes(key)
    )
      ? 'STATUS_CHANGE'
      : 'UPDATE';
  }
  const changedKeys = summary.changedKeys || [];
  if (summary.statusChanged) return 'STATUS_CHANGE';
  return changedKeys.some((key) =>
    ['status', 'current_stage', 'procurement_status', 'item_delivery_status', 'stock_status', 'stock_source'].includes(key)
  )
    ? 'STATUS_CHANGE'
    : 'UPDATE';
}