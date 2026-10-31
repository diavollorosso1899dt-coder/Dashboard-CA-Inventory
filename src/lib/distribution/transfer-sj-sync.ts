import type { AssetTransfer, SuratJalan } from '../supabase/types';

const KALBAR_KEYWORDS = [
  'kalbar',
  'kalimantan barat',
  'pontianak',
  'singkawang',
  'ketapang',
  'sambas',
  'sintang',
  'mempawah',
  'kubu raya',
  'kuburaya',
  'sanggau',
  'sekadau',
  'melawi',
  'kapuas hulu',
  'kayong',
  'bengkayang',
  'ngabang',
  'landak',
  'tanray',
  'tanjung raya',
  'siantan',
  'sungai raya',
  'serdam',
  'jeruju',
  'kota baru',
  'kotabaru',
  'purnama',
  'gajahmada',
  'merdeka',
];

function normalizeRegionValue(val?: string | null): 'JABODETABEK' | 'KALBAR' | null {
  if (!val) return null;
  const upper = String(val).toUpperCase().trim();
  if (upper === 'KALBAR' || upper.includes('KALBAR') || upper.includes('KALIMANTAN')) {
    return 'KALBAR';
  }
  if (upper === 'JABODETABEK' || upper === 'JABO' || upper.includes('JABO')) {
    return 'JABODETABEK';
  }
  return null;
}

export function resolveTransferRegion(options: {
  explicitRegion?: string | null;
  toLocation?: string | null;
  outlets?: Array<{ name?: string; branch_name?: string; nama?: string; region?: string }>;
  requestOrders?: Array<{ branch_name?: string; region?: string }>;
  assets?: Array<{ branch_name?: string; region?: string }>;
  fallbackRegion?: string | null;
}): 'JABODETABEK' | 'KALBAR' {
  const explicit = normalizeRegionValue(options.explicitRegion);
  if (explicit) return explicit;

  const target = (options.toLocation || '').toLowerCase().trim();
  if (target) {
    for (const o of options.outlets || []) {
      const name = (o.branch_name || o.name || o.nama || '').toLowerCase().trim();
      if (name && name === target) {
        const reg = normalizeRegionValue(o.region);
        if (reg) return reg;
      }
    }

    for (const ro of options.requestOrders || []) {
      const name = (ro.branch_name || '').toLowerCase().trim();
      if (name && name === target) {
        const reg = normalizeRegionValue(ro.region);
        if (reg) return reg;
      }
    }

    for (const a of options.assets || []) {
      const name = (a.branch_name || '').toLowerCase().trim();
      if (name && name === target) {
        const reg = normalizeRegionValue(a.region);
        if (reg) return reg;
      }
    }

    if (KALBAR_KEYWORDS.some((kw) => target.includes(kw))) {
      return 'KALBAR';
    }
  }

  const fallback = normalizeRegionValue(options.fallbackRegion);
  if (fallback) return fallback;

  return 'JABODETABEK';
}

const VALID_ASSET_TRANSFERS_DB_COLUMNS = [
  'id',
  'transfer_number',
  'from_location',
  'to_location',
  'transfer_date',
  'status',
  'sender_pic',
  'receiver_pic',
  'items',
  'notes',
  'created_at',
  'updated_at',
] as const;

export function sanitizeAssetTransferDbPayload(raw: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const col of VALID_ASSET_TRANSFERS_DB_COLUMNS) {
    if (raw[col] !== undefined) {
      clean[col] = raw[col];
    }
  }
  return clean;
}

const VALID_SURAT_JALAN_DB_COLUMNS = [
  'id',
  'sj_number',
  'ro_id',
  'ro_number',
  'branch_name',
  'region',
  'delivery_date',
  'driver_name',
  'driver_phone',
  'vehicle_number',
  'expedition',
  'sender_name',
  'receiver_name',
  'status',
  'received_at',
  'items',
  'notes',
  'created_at',
  'updated_at',
] as const;

export function sanitizeSuratJalanDbPayload(raw: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const col of VALID_SURAT_JALAN_DB_COLUMNS) {
    if (raw[col] !== undefined) {
      clean[col] = raw[col];
    }
  }
  return clean;
}

/**
 * Mengambil nama kolom yang tidak dikenal dari pesan error PostgREST/Supabase,
 * sehingga payload bisa diulang tanpa kolom tersebut (PGRST204 / 42703).
 */
export function extractUnknownColumnFromError(message?: string | null): string | null {
  if (!message) return null;
  const text = String(message);
  const pgrest = /Could not find the '([^']+)' column/i.exec(text);
  if (pgrest) return pgrest[1];
  const postgres = /column "([^"]+)" of relation/i.exec(text);
  if (postgres) return postgres[1];
  const postgresAlt = /column "([^"]+)" does not exist/i.exec(text);
  if (postgresAlt) return postgresAlt[1];
  return null;
}

/** Membuang kolom tertentu dari payload agar insert/update bisa diulang. */
export function stripUnknownColumns(
  payload: Record<string, any>,
  columns: string[]
): Record<string, any> {
  if (columns.length === 0) return payload;
  const dropped = new Set(columns);
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!dropped.has(key)) clean[key] = value;
  }
  return clean;
}

export function mapAssetTransferToSuratJalan(
  tr: Partial<AssetTransfer> & Record<string, any>,
  resolvedRegion: 'JABODETABEK' | 'KALBAR' = 'JABODETABEK'
): SuratJalan {
  const sjNo = tr.surat_jalan_number || tr.transfer_number || `SJ-DIST/${new Date().getFullYear()}/0000`;
  const branch = tr.to_location || 'Outlet Tujuan';
  const deliveryDate = tr.transfer_date || new Date().toISOString().split('T')[0];
  const driver = tr.expedition_courier || 'Armada Internal SCGA';
  const vehicle = tr.tracking_number || '-';
  const sender = tr.sender_pic || 'Staff Gudang SCGA';
  const receiver = tr.receiver_pic || '';
  const status =
    tr.status === 'RECEIVED' || tr.status === 'COMPLETED'
      ? 'DELIVERED'
      : tr.status === 'IN_TRANSIT'
        ? 'SHIPPED'
        : 'PROCESSED';

  const firstItemWithProof = (tr.items || []).find(
    (it: any) => it?.tanda_tangan_url || it?.signature_url || it?.foto_bukti_url || it?.photo_url
  ) as any;
  const signatureUrl =
    tr.tanda_tangan_url ||
    tr.signature_url ||
    firstItemWithProof?.tanda_tangan_url ||
    firstItemWithProof?.signature_url;
  const photoUrl =
    tr.foto_bukti_url ||
    tr.photo_url ||
    firstItemWithProof?.foto_bukti_url ||
    firstItemWithProof?.photo_url;

  return {
    id: tr.id || '',
    sj_number: sjNo,
    nomor_sj: sjNo,
    ro_number: tr.transfer_number || sjNo,
    ro_nomor: tr.transfer_number || sjNo,
    branch_name: branch,
    tujuan_outlet_nama: branch,
    region: resolvedRegion,
    delivery_date: deliveryDate,
    tanggal_kirim: deliveryDate,
    driver_name: driver,
    driver_nama: driver,
    vehicle_number: vehicle,
    kendaraan_plat: vehicle,
    expedition: driver,
    ekspedisi: driver,
    sender_name: sender,
    pengirim_nama: sender,
    receiver_name: receiver,
    penerima_nama: receiver,
    status,
    received_at: tr.received_date || undefined,
    waktu_diterima: tr.received_date || undefined,
    catatan_penerimaan: tr.received_notes || undefined,
    tanda_tangan_url: signatureUrl,
    foto_bukti_url: photoUrl,
    items: (tr.items || []).map((it: any) => ({
      ...it,
      id: it.id,
      item_name: it.item_name || it.nama_barang,
      nama_barang: it.item_name || it.nama_barang,
      quantity: it.quantity ?? it.qty ?? 1,
      qty: it.quantity ?? it.qty ?? 1,
      received_quantity: it.received_quantity ?? it.received_qty,
      specification: it.specification,
      notes: it.notes || it.catatan,
    })),
    notes: tr.notes || '',
    catatan: tr.notes || '',
    created_at: tr.created_at || new Date().toISOString(),
  } as SuratJalan;
}

export function mergeAssetTransfersLists(
  dbTransfers: AssetTransfer[],
  cachedTransfers: AssetTransfer[]
): AssetTransfer[] {
  // DB adalah sumber kebenaran. Cache hanya dipakai untuk melengkapi field yang
  // belum ada di baris DB (mis. dokumen yang baru dibuat dan belum tersimpan).
  // Sebelumnya cache diiterasi lebih dulu sehingga status lama di cache bisa
  // menutupi status terbaru dari DB -- penyebab status "kembali ke awal".
  const result: AssetTransfer[] = [];
  const byId = new Map<string, AssetTransfer>();

  const keyOf = (tr: AssetTransfer) =>
    (tr.id || tr.transfer_number || '').toLowerCase();

  for (const tr of dbTransfers || []) {
    if (!tr) continue;
    const key = keyOf(tr);
    if (!key) continue;
    byId.set(key, tr);
    result.push(tr);
  }

  for (const tr of cachedTransfers || []) {
    if (!tr) continue;
    const key = keyOf(tr);
    if (!key) continue;

    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, tr);
      result.push(tr);
      continue;
    }

    // Jangan timpa nilai DB yang sudah terisi; isi hanya field kosong.
    for (const [field, value] of Object.entries(tr)) {
      const current = (existing as any)[field];
      if (current === undefined || current === null || current === '') {
        (existing as any)[field] = value;
      }
    }
  }

  result.sort(
    (a, b) =>
      new Date(b.created_at || b.transfer_date || 0).getTime() -
      new Date(a.created_at || a.transfer_date || 0).getTime()
  );
  return result;
}

function suratJalanFreshness(doc: SuratJalan | undefined): number {
  if (!doc) return 0;
  const candidates = [doc.updated_at, doc.received_at, doc.created_at];
  let newest = 0;
  for (const value of candidates) {
    if (!value) continue;
    const ts = new Date(value).getTime();
    if (Number.isFinite(ts) && ts > newest) newest = ts;
  }
  return newest;
}

export function mergeSuratJalanLists(options: {
  dbSuratJalan: SuratJalan[];
  cachedSuratJalan: SuratJalan[];
  transfers: AssetTransfer[];
  resolveRegion: (toLocation: string, explicitRegion?: string | null) => 'JABODETABEK' | 'KALBAR';
}): SuratJalan[] {
  const list: SuratJalan[] = [];
  const priority: number[] = [];

  const findExistingIndex = (id: string, sjNo: string) =>
    list.findIndex(
      (doc) =>
        (id && (doc.id || '').toLowerCase() === id) ||
        (sjNo &&
          ((doc.sj_number || '').toLowerCase() === sjNo ||
            (doc.nomor_sj || '').toLowerCase() === sjNo))
    );

  const addSj = (raw: SuratJalan, tier = 2) => {
    if (!raw) return;
    const id = (raw.id || '').toLowerCase();
    const sjNo = (raw.sj_number || raw.nomor_sj || '').toLowerCase();

    const branch = raw.branch_name || raw.tujuan_outlet_nama || '';
    const resolvedRegion = options.resolveRegion(branch, raw.region);
    const firstItemWithProof = (raw.items || []).find(
      (it: any) => it?.tanda_tangan_url || it?.signature_url || it?.foto_bukti_url || it?.photo_url
    ) as any;
    const signatureUrl =
      raw.tanda_tangan_url ||
      (raw as any).signature_url ||
      firstItemWithProof?.tanda_tangan_url ||
      firstItemWithProof?.signature_url;
    const photoUrl =
      raw.foto_bukti_url ||
      (raw as any).photo_url ||
      firstItemWithProof?.foto_bukti_url ||
      firstItemWithProof?.photo_url;

    const normalized: SuratJalan = {
      ...raw,
      sj_number: raw.sj_number || raw.nomor_sj || '',
      nomor_sj: raw.nomor_sj || raw.sj_number || '',
      ro_number: raw.ro_number || raw.ro_nomor || '',
      ro_nomor: raw.ro_nomor || raw.ro_number || '',
      branch_name: branch,
      tujuan_outlet_nama: branch,
      region: resolvedRegion,
      delivery_date: raw.delivery_date || raw.tanggal_kirim || '',
      tanggal_kirim: raw.tanggal_kirim || raw.delivery_date || '',
      driver_name: raw.driver_name || raw.driver_nama || 'Armada Internal SCGA',
      driver_nama: raw.driver_nama || raw.driver_name || 'Armada Internal SCGA',
      vehicle_number: raw.vehicle_number || raw.kendaraan_plat || '-',
      kendaraan_plat: raw.kendaraan_plat || raw.vehicle_number || '-',
      expedition: raw.expedition || raw.ekspedisi || 'Armada Internal SCGA',
      ekspedisi: raw.ekspedisi || raw.expedition || 'Armada Internal SCGA',
      sender_name: raw.sender_name || raw.pengirim_nama || 'Staff Gudang SCGA',
      pengirim_nama: raw.pengirim_nama || raw.sender_name || 'Staff Gudang SCGA',
      receiver_name: raw.receiver_name || raw.penerima_nama || '',
      penerima_nama: raw.penerima_nama || raw.receiver_name || '',
      tanda_tangan_url: signatureUrl,
      foto_bukti_url: photoUrl,
    };

    const existingIdx = findExistingIndex(id, sjNo);
    if (existingIdx === -1) {
      list.push(normalized);
      priority.push(tier);
      return;
    }

    // Dokumen yang sama bisa muncul dari DB, cache, dan asset_transfers.
    // Dokumen surat_jalan (DB/cache) selalu lebih dipercaya daripada hasil
    // pemetaan asset_transfers, karena status transfer bisa tertinggal.
    const existingPriority = priority[existingIdx] ?? 0;
    if (tier > existingPriority) {
      list[existingIdx] = { ...list[existingIdx], ...normalized };
      priority[existingIdx] = tier;
      return;
    }
    if (tier < existingPriority) return;

    // Tier sama: pertahankan versi terbaru agar status/proof tidak tertimpa data basi.
    if (suratJalanFreshness(normalized) > suratJalanFreshness(list[existingIdx])) {
      list[existingIdx] = { ...list[existingIdx], ...normalized };
    }
  };

  // DB lebih dulu sebagai sumber kebenaran, lalu cache (dokumen yang baru dibuat
  // dan belum sempat tersimpan), lalu hasil pemetaan asset_transfers.
  for (const sj of options.dbSuratJalan || []) {
    addSj(sj);
  }
  for (const sj of options.cachedSuratJalan || []) {
    addSj(sj);
  }
  for (const tr of options.transfers || []) {
    const resolvedRegion = options.resolveRegion(tr.to_location || '', (tr as any).region);
    addSj(mapAssetTransferToSuratJalan(tr, resolvedRegion), 1);
  }

  list.sort(
    (a, b) =>
      new Date(b.created_at || b.delivery_date || 0).getTime() -
      new Date(a.created_at || a.delivery_date || 0).getTime()
  );
  return list;
}

