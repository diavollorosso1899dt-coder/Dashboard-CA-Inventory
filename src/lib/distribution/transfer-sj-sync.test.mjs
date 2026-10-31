import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTransferRegion,
  sanitizeAssetTransferDbPayload,
  sanitizeSuratJalanDbPayload,
  mapAssetTransferToSuratJalan,
  mergeSuratJalanLists,
  extractUnknownColumnFromError,
  stripUnknownColumns,
} from './transfer-sj-sync.ts';

test('resolveTransferRegion mengenali region outlet dari daftar RO/Outlet maupun fallback region aktif', () => {
  const region = resolveTransferRegion({
    explicitRegion: undefined,
    toLocation: 'Sop Mak Garang Singkawang',
    outlets: [],
    requestOrders: [
      { branch_name: 'Sop Mak Garang Singkawang', region: 'KALBAR' },
      { branch_name: 'Mie Ayam Muntjul Karawang', region: 'JABODETABEK' },
    ],
    assets: [],
  });
  assert.equal(region, 'KALBAR');

  const regionFromFallback = resolveTransferRegion({
    explicitRegion: undefined,
    toLocation: 'GA',
    outlets: [],
    requestOrders: [{ branch_name: 'GA', region: 'KALBAR' }],
    assets: [],
  });
  assert.equal(regionFromFallback, 'KALBAR');
});

test('sanitizeAssetTransferDbPayload hanya menyertakan kolom valid tabel asset_transfers Supabase', () => {
  const raw = {
    id: 'f5933dc5-e6f3-43e3-a8b9-4c0016f8ae62',
    transfer_number: 'DIST/2026/3050',
    surat_jalan_number: 'SJ-DIST/2026/3050',
    source_type: 'GUDANG_PUSAT',
    from_location: 'Gudang Pusat SCGA',
    destination_type: 'OUTLET',
    to_location: 'Sop Mak Garang Singkawang',
    region: 'KALBAR',
    transfer_date: '2026-10-30',
    status: 'IN_TRANSIT',
    sender_pic: 'Staff Logistik SCGA',
    receiver_pic: '',
    expedition_courier: 'Armada Internal SCGA',
    tracking_number: 'RESI-927500',
    items: [{ id: '1', item_name: 'Kompor', quantity: 1 }],
    notes: 'Catatan',
    created_at: '2026-10-30T07:55:31.104Z',
  };

  const dbPayload = sanitizeAssetTransferDbPayload(raw);
  assert.equal('destination_type' in dbPayload, false);
  assert.equal('source_type' in dbPayload, false);
  assert.equal('surat_jalan_number' in dbPayload, false);
  assert.equal('expedition_courier' in dbPayload, false);
  assert.equal('tracking_number' in dbPayload, false);
  assert.equal(dbPayload.transfer_number, 'DIST/2026/3050');
  assert.equal(dbPayload.to_location, 'Sop Mak Garang Singkawang');
});

test('sanitizeSuratJalanDbPayload hanya menyertakan kolom valid tabel surat_jalan Supabase', () => {
  const sj = mapAssetTransferToSuratJalan(
    {
      id: 'f5933dc5-e6f3-43e3-a8b9-4c0016f8ae62',
      transfer_number: 'DIST/2026/3050',
      surat_jalan_number: 'SJ-DIST/2026/3050',
      from_location: 'Gudang Pusat SCGA',
      to_location: 'Sop Mak Garang Singkawang',
      transfer_date: '2026-10-30',
      status: 'IN_TRANSIT',
      sender_pic: 'Staff Logistik SCGA',
      receiver_pic: '',
      expedition_courier: 'Armada Internal SCGA',
      tracking_number: 'RESI-927500',
      items: [{ id: '1', item_name: 'Kompor', quantity: 2 }],
      notes: 'Catatan',
      created_at: '2026-10-30T07:55:31.104Z',
    },
    'KALBAR'
  );

  assert.equal(sj.region, 'KALBAR');
  assert.equal(sj.sj_number, 'SJ-DIST/2026/3050');

  const dbPayload = sanitizeSuratJalanDbPayload(sj);
  assert.equal('nomor_sj' in dbPayload, false);
  assert.equal('tujuan_outlet_nama' in dbPayload, false);
  assert.equal('tanggal_kirim' in dbPayload, false);
  assert.equal('driver_nama' in dbPayload, false);
  assert.equal(dbPayload.region, 'KALBAR');
  assert.equal(dbPayload.sj_number, 'SJ-DIST/2026/3050');
  assert.equal(dbPayload.branch_name, 'Sop Mak Garang Singkawang');
});

test('mergeSuratJalanLists menggabungkan DB surat_jalan, cache suratJalan, dan asset_transfers tanpa kehilangan dokumen baru', () => {
  const dbSj = [
    {
      id: 'sj-1',
      sj_number: 'SJ-DIST/2026/1001',
      branch_name: 'Outlet Lama',
      region: 'JABODETABEK',
      delivery_date: '2026-10-29',
      status: 'SHIPPED',
      items: [],
      created_at: '2026-10-29T01:00:00.000Z',
    },
  ];
  const cachedSj = [
    {
      id: 'sj-2',
      sj_number: 'SJ-DIST/2026/2002',
      branch_name: 'GA',
      region: 'KALBAR',
      delivery_date: '2026-10-30',
      status: 'SHIPPED',
      items: [],
      created_at: '2026-10-30T08:00:00.000Z',
    },
  ];
  const transfers = [
    {
      id: 'tr-3',
      transfer_number: 'DIST/2026/3003',
      surat_jalan_number: 'SJ-DIST/2026/3003',
      from_location: 'Gudang Pusat SCGA',
      to_location: 'Sop Mak Garang Singkawang',
      transfer_date: '2026-10-30',
      status: 'IN_TRANSIT',
      sender_pic: 'Staff',
      receiver_pic: '',
      items: [{ id: 'i1', item_name: 'Panci', quantity: 1 }],
      created_at: '2026-10-30T09:00:00.000Z',
    },
  ];

  const merged = mergeSuratJalanLists({
    dbSuratJalan: dbSj,
    cachedSuratJalan: cachedSj,
    transfers,
    resolveRegion: (loc, explicit) =>
      explicit || (loc.includes('Singkawang') || loc === 'GA' ? 'KALBAR' : 'JABODETABEK'),
  });

  assert.equal(merged.length, 3);
  assert.equal(merged[0].sj_number, 'SJ-DIST/2026/3003');
  assert.equal(merged[0].region, 'KALBAR');
  assert.equal(merged[1].sj_number, 'SJ-DIST/2026/2002');
  assert.equal(merged[1].region, 'KALBAR');
});

test('mergeSuratJalanLists memakai data DB terbaru ketika dokumen yang sama ada di cache basi', () => {
  const dbSj = [
    {
      id: 'sj-9',
      sj_number: 'SJ-DIST/2026/9009',
      branch_name: 'Outlet A',
      region: 'JABODETABEK',
      delivery_date: '2026-10-30',
      status: 'DELIVERED',
      updated_at: '2026-10-30T10:00:00.000Z',
      items: [{ id: 'i1', item_name: 'Meja', quantity: 2 }],
      created_at: '2026-10-30T01:00:00.000Z',
    },
  ];
  const staleCache = [
    {
      id: 'sj-9',
      sj_number: 'SJ-DIST/2026/9009',
      branch_name: 'Outlet A',
      region: 'JABODETABEK',
      delivery_date: '2026-10-30',
      status: 'SHIPPED',
      updated_at: '2026-10-29T10:00:00.000Z',
      items: [],
      created_at: '2026-10-30T01:00:00.000Z',
    },
  ];

  const merged = mergeSuratJalanLists({
    dbSuratJalan: dbSj,
    cachedSuratJalan: staleCache,
    transfers: [],
    resolveRegion: (loc, explicit) => explicit || loc,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'DELIVERED');
  assert.equal(merged[0].items.length, 1);
});

test('mergeSuratJalanLists membiarkan cache menang bila lebih baru dari DB', () => {
  const dbSj = [
    {
      id: 'sj-10',
      sj_number: 'SJ-DIST/2026/1010',
      branch_name: 'Outlet B',
      region: 'JABODETABEK',
      status: 'SHIPPED',
      updated_at: '2026-10-29T09:00:00.000Z',
      items: [],
      created_at: '2026-10-29T01:00:00.000Z',
    },
  ];
  const freshCache = [
    {
      id: 'sj-10',
      sj_number: 'SJ-DIST/2026/1010',
      branch_name: 'Outlet B',
      region: 'JABODETABEK',
      status: 'DELIVERED',
      updated_at: '2026-10-30T09:00:00.000Z',
      received_at: '2026-10-30T09:00:00.000Z',
      items: [{ id: 'i1', item_name: 'Kursi', quantity: 1, received_quantity: 1 }],
      created_at: '2026-10-29T01:00:00.000Z',
    },
  ];

  const merged = mergeSuratJalanLists({
    dbSuratJalan: dbSj,
    cachedSuratJalan: freshCache,
    transfers: [],
    resolveRegion: (loc, explicit) => explicit || 'JABODETABEK',
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'DELIVERED');
  assert.equal(merged[0].items[0].received_quantity, 1);
});

test('mergeSuratJalanLists tidak membiarkan status transfer yang tertinggal menimpa Surat Jalan yang sudah DELIVERED', () => {
  const dbSj = [
    {
      id: 'db8b3348-1558-412d-831d-b5387310bd1a',
      sj_number: 'SJ-DIST/2026/1126',
      branch_name: 'Sop Mak Garang Perdana',
      region: 'KALBAR',
      status: 'DELIVERED',
      updated_at: '2026-10-30T09:03:49.000Z',
      received_at: '2026-10-30T09:04:18.000Z',
      items: [{ id: 'i1', item_name: 'Kompor', quantity: 1, received_quantity: 1 }],
      created_at: '2026-10-30T09:03:58.000Z',
    },
  ];
  const transfers = [
    {
      id: 'db8b3348-1558-412d-831d-b5387310bd1a',
      transfer_number: 'DIST/2026/1126',
      surat_jalan_number: 'SJ-DIST/2026/1126',
      from_location: 'Gudang Pusat SCGA',
      to_location: 'Sop Mak Garang Perdana',
      transfer_date: '2026-10-30',
      status: 'IN_TRANSIT',
      sender_pic: 'Staff',
      receiver_pic: '',
      items: [{ id: 'i1', item_name: 'Kompor', quantity: 1 }],
      created_at: '2026-10-30T09:03:59.000Z',
    },
  ];

  const merged = mergeSuratJalanLists({
    dbSuratJalan: dbSj,
    cachedSuratJalan: [],
    transfers,
    resolveRegion: (loc, explicit) => explicit || 'KALBAR',
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'DELIVERED');
  assert.equal(merged[0].received_at, '2026-10-30T09:04:18.000Z');
});

test('extractUnknownColumnFromError membaca pesan PostgREST dan PostgreSQL', () => {
  assert.equal(
    extractUnknownColumnFromError("Could not find the 'received_date' column of 'asset_transfers' in the schema cache"),
    'received_date'
  );
  assert.equal(
    extractUnknownColumnFromError('column "tanda_tangan_url" of relation "surat_jalan" does not exist'),
    'tanda_tangan_url'
  );
  assert.equal(extractUnknownColumnFromError('duplicate key value violates unique constraint'), null);
  assert.deepEqual(stripUnknownColumns({ a: 1, b: 2, c: 3 }, ['b']), { a: 1, c: 3 });
});

