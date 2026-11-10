import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterAdditionDrafts,
  selectNewAdditionDrafts,
  planSessionAppend,
  mergeMasterStockAdditions,
  mergeSoStockWithAdditions,
  mergeSoStockItemLists,
  selectCatalogAdditions,
} from './additions.ts';

const draft = (overrides = {}) => ({
  region: 'KALBAR',
  item_name: 'Keset karet mie',
  normalized_name: 'keset karet mie',
  sku: null,
  unit: 'bh',
  classification: 'Perlengkapan Tetap',
  specification: null,
  photo_url: null,
  source: 'RO',
  source_ro_number: 'RO-104995',
  is_active: true,
  ...overrides,
});

test('buildMasterAdditionDrafts melewati item cancel dan nama kosong', () => {
  const drafts = buildMasterAdditionDrafts({
    region: 'KALBAR',
    roNumber: 'RO-104995',
    items: [
      {
        item_name: 'Keset karet mie',
        sku: '',
        unit: 'bh',
        item_type: 'Perlengkapan Tetap',
        stock_source: 'PR_VENDOR',
      },
      { item_name: '   ', sku: 'X', stock_source: 'GUDANG_SCGA' },
      { item_name: 'Item Batal', sku: 'B-1', stock_source: 'CANCELLED' },
    ],
  });

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].item_name, 'Keset karet mie');
  assert.equal(drafts[0].normalized_name, 'keset karet mie');
  assert.equal(drafts[0].unit, 'bh');
  assert.equal(drafts[0].source_ro_number, 'RO-104995');
  assert.equal(drafts[0].is_active, true);
});

test('buildMasterAdditionDrafts dedupe nama dan SKU dalam satu batch', () => {
  const drafts = buildMasterAdditionDrafts({
    region: 'JABODETABEK',
    items: [
      { item_name: 'Kursi', sku: 'K-1' },
      { item_name: 'kursi', sku: 'K-2' },
      { item_name: 'Meja', sku: 'K-1' },
      { item_name: 'Lemari', sku: '' },
    ],
  });

  assert.deepEqual(
    drafts.map((item) => item.item_name),
    ['Kursi', 'Lemari']
  );
  assert.equal(drafts[0].classification, 'Perlengkapan Tetap');
  assert.equal(drafts[0].unit, 'unit');
});

test('buildMasterAdditionDrafts memakai katalog hanya untuk exact name atau SKU', () => {
  const catalog = [
    {
      item_name: 'Keset Karet Bolong - 60x40cm',
      sku: 'BGPTK-P00472',
      unit: 'pcs',
      classification: 'Perlengkapan Tetap',
      specification: 'Karet',
      photo_url: '/uploads/karet.png',
    },
    {
      item_name: 'Akrilik Sign Wastafel',
      sku: 'AKR-1',
      unit: 'set',
      classification: 'Peralatan',
      specification: 'Akrilik 3mm',
      photo_url: null,
    },
  ];

  const drafts = buildMasterAdditionDrafts({
    region: 'KALBAR',
    items: [
      { item_name: 'Keset karet mie', sku: '' },
      { item_name: 'akrilik sign wastafel', sku: '' },
      { item_name: 'Nama Berbeda', sku: 'AKR-1' },
    ],
    catalog,
  });

  // Tidak boleh fuzzy-match ke "Keset Karet Bolong - 60x40cm".
  assert.equal(drafts[0].sku, null);
  assert.equal(drafts[0].unit, 'unit');
  assert.equal(drafts[0].specification, null);

  // Exact normalized name dan exact SKU boleh memperkaya metadata.
  assert.equal(drafts[1].unit, 'set');
  assert.equal(drafts[1].classification, 'Peralatan');
  assert.equal(drafts[2].classification, 'Peralatan');
  assert.equal(drafts[2].unit, 'set');
});

test('region tetap terpisah untuk nama yang sama', () => {
  const jabo = buildMasterAdditionDrafts({
    region: 'JABODETABEK',
    items: [{ item_name: 'Kursi' }],
  });
  const kalbar = buildMasterAdditionDrafts({
    region: 'KALBAR',
    items: [{ item_name: 'Kursi' }],
  });

  assert.equal(jabo[0].region, 'JABODETABEK');
  assert.equal(kalbar[0].region, 'KALBAR');
});

test('selectNewAdditionDrafts melewati yang sudah ada dan menghormati region', () => {
  const drafts = [
    draft({ region: 'KALBAR', normalized_name: 'keset karet mie' }),
    draft({
      region: 'KALBAR',
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'M-1',
    }),
  ];
  const existing = [
    { region: 'KALBAR', normalized_name: 'keset karet mie', sku: null },
    { region: 'JABODETABEK', normalized_name: 'meja', sku: null },
  ];

  const result = selectNewAdditionDrafts(drafts, existing);

  assert.deepEqual(result.map((item) => item.item_name), ['Meja']);
});

test('planSessionAppend menghasilkan id deterministik, qty 0, dan melewati item yang sudah ada', () => {
  const options = {
    sessionId: 'so-kalbar-2026-11-10',
    additions: [
      draft({
        item_name: 'Keset karet mie',
        sku: null,
        normalized_name: 'keset karet mie',
      }),
      draft({
        item_name: 'Akrilik Sign Wastafel',
        sku: 'AKR-1',
        normalized_name: 'akrilik sign wastafel',
      }),
    ],
    existingDetails: [
      { kode_barang: 'Keset karet mie', nama_barang: 'Keset karet mie' },
    ],
  };

  const rows = planSessionAppend(options);

  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^so-kalbar-2026-11-10-auto-[0-9a-f]{8}$/);
  assert.equal(rows[0].kode_barang, 'AKR-1');
  assert.equal(rows[0].stok_awal, 0);
  assert.equal(rows[0].qty_penerimaan, 0);
  assert.equal(rows[0].qty_ro, 0);
  assert.equal(rows[0].stok_sistem, 0);
  assert.equal(rows[0].qty_fisik, null);
  assert.equal(rows[0].selisih, null);
  assert.equal(rows[0].status_selisih, 'UNCHECKED');
  assert.equal(rows[0].catatan, 'Ditambahkan otomatis dari RO-104995');

  const again = planSessionAppend(options);
  assert.equal(again[0].id, rows[0].id);
});

test('planSessionAppend memakai nama sebagai kode bila SKU kosong', () => {
  const rows = planSessionAppend({
    sessionId: 'so-kalbar-2026-11-10',
    additions: [draft({ sku: null })],
    existingDetails: [],
  });

  assert.equal(rows[0].kode_barang, 'Keset karet mie');
  assert.equal(rows[0].kategori, 'Perlengkapan Tetap');
  assert.equal(rows[0].lokasi, 'Gedung / Kantor');
});

test('mergeMasterStockAdditions tidak menimpa master sheet dan menambah qty 0', () => {
  const stock = new Map([['SKU-1', 7]]);
  const details = new Map([
    [
      'SKU-1',
      {
        nama_barang: 'Kursi',
        satuan: 'UNIT',
        lokasi: 'Ruang Peralatan',
        kategori: 'Peralatan',
      },
    ],
  ]);

  const result = mergeMasterStockAdditions({
    stock,
    details,
    additions: [
      draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: 'SKU-1' }),
      draft({
        item_name: 'Keset karet mie',
        normalized_name: 'keset karet mie',
        sku: null,
      }),
    ],
  });

  assert.equal(result.stock.get('SKU-1'), 7);
  assert.equal(result.stock.get('Keset karet mie'), 0);
  assert.equal(result.details.get('Keset karet mie').kategori, 'Perlengkapan Tetap');
  assert.equal(result.added, 1);

  // Map input tidak boleh berubah.
  assert.equal(stock.size, 1);
  assert.equal(details.size, 1);

  const again = mergeMasterStockAdditions({
    stock: result.stock,
    details: result.details,
    additions: [draft({ sku: null })],
  });
  assert.equal(again.added, 0);
});

test('mergeSoStockWithAdditions menambah item baru dengan stok sistem 0', () => {
  const items = [
    {
      kode_barang: 'SKU-1',
      nama_barang: 'Kursi',
      stok_sistem: 4,
      qty_fisik: 3,
      satuan: 'UNIT',
    },
  ];

  const result = mergeSoStockWithAdditions(items, [
    draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: 'SKU-1' }),
    draft(),
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].stok_sistem, 4);
  assert.deepEqual(result[1], {
    kode_barang: 'Keset karet mie',
    nama_barang: 'Keset karet mie',
    stok_sistem: 0,
    qty_fisik: null,
    satuan: 'bh',
  });
});

test('mergeSoStockItemLists mempertahankan item lokal dan item cloud-only', () => {
  const local = [
    { kode_barang: 'A', nama_barang: 'Kursi', stok_sistem: 5, qty_fisik: 5 },
  ];
  const cloud = [
    { kode_barang: 'A', nama_barang: 'Kursi', stok_sistem: 4, qty_fisik: 4 },
    {
      kode_barang: 'Keset karet mie',
      nama_barang: 'Keset karet mie',
      stok_sistem: 0,
      qty_fisik: null,
    },
  ];

  const merged = mergeSoStockItemLists(local, cloud);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].stok_sistem, 5);
  assert.equal(merged[1].nama_barang, 'Keset karet mie');
});

test('selectCatalogAdditions melewati katalog yang sudah ada dan dedupe antar region', () => {
  const catalog = [
    { item_name: 'Kursi', system_item_name: 'Kursi', sku: 'SKU-1' },
  ];
  const additions = [
    draft({ item_name: 'Kursi', normalized_name: 'kursi', sku: null }),
    draft({
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'SKU-9',
      region: 'KALBAR',
    }),
    draft({
      item_name: 'Meja',
      normalized_name: 'meja',
      sku: 'SKU-9',
      region: 'JABODETABEK',
    }),
  ];

  const result = selectCatalogAdditions(catalog, additions);

  assert.equal(result.length, 1);
  assert.equal(result[0].item_name, 'Meja');
});
