import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRoForSync, mergeRoItemsForSync } from './ro-sync-merge.ts';

const sheetOrder = (overrides = {}) => ({
  id: 'ro-generated',
  ro_number: 'RO-103322',
  raw_ro_id: '103322',
  branch_name: 'Mie Ayam Muntjul Dansen',
  region: 'KALBAR',
  requester_name: 'Logistik Kalbar via Spreadsheet',
  request_date: '2026-11-01',
  target_delivery_date: null,
  status: 'INPUT_SYSTEM',
  current_stage: 'REQUEST_ORDER',
  source_type: 'GOOGLE_SHEET',
  warehouse_name: 'Gudang Kalbar',
  notes: null,
  items: [
    { id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, stock_source: 'ON_PROSES' },
    { id: 'roi-2', item_name: 'Kursi Kayu', quantity_ordered: 40, stock_source: 'ON_PROSES' },
  ],
  ...overrides,
});

const existingOrder = (overrides = {}) => ({
  id: 'db-uuid-1',
  ro_number: 'RO-103322',
  raw_ro_id: '103322',
  branch_name: 'Mie Ayam Muntjul Dansen',
  region: 'KALBAR',
  requester_name: 'Logistik Kalbar via Spreadsheet',
  request_date: '2026-11-01',
  target_delivery_date: '2026-11-20',
  status: 'READY_STOCK',
  current_stage: 'READY_STOCK',
  source_type: 'GOOGLE_SHEET',
  warehouse_name: 'Gudang Kalbar',
  notes: 'Catatan RO dari user',
  items: [
    {
      id: 'roi-1',
      item_name: 'Meja Lesehan',
      quantity_ordered: 6,
      quantity_fulfilled: 6,
      stock_source: 'GUDANG_SCGA',
      notes: 'Bebas lah',
    },
  ],
  ...overrides,
});

test('status dan tahap RO yang sudah diubah user tidak kembali saat sync', () => {
  const merged = mergeRoForSync(sheetOrder(), existingOrder());
  assert.equal(merged.status, 'READY_STOCK');
  assert.equal(merged.current_stage, 'READY_STOCK');
  assert.equal(merged.id, 'db-uuid-1');
});

test('catatan RO yang sudah diisi user dipertahankan', () => {
  const merged = mergeRoForSync(sheetOrder(), existingOrder());
  assert.equal(merged.notes, 'Catatan RO dari user');
});

test('tanggal yang sudah diubah user dipertahankan', () => {
  const merged = mergeRoForSync(sheetOrder(), existingOrder());
  assert.equal(merged.target_delivery_date, '2026-11-20');
});

test('field yang masih kosong di database diisi dari spreadsheet', () => {
  const merged = mergeRoForSync(
    sheetOrder({ warehouse_name: 'Gudang Kalbar' }),
    existingOrder({ warehouse_name: '' })
  );
  assert.equal(merged.warehouse_name, 'Gudang Kalbar');
});

test('status dan catatan item hasil update user dipertahankan', () => {
  const merged = mergeRoForSync(sheetOrder(), existingOrder());
  const meja = merged.items.find((it) => it.item_name === 'Meja Lesehan');
  assert.equal(meja.stock_source, 'GUDANG_SCGA');
  assert.equal(meja.quantity_fulfilled, 6);
  assert.equal(meja.notes, 'Bebas lah');
});

test('item baru dari spreadsheet tetap ditambahkan tanpa menghapus item lama', () => {
  const merged = mergeRoForSync(sheetOrder(), existingOrder());
  assert.equal(merged.items.length, 2);
  assert.ok(merged.items.some((it) => it.item_name === 'Kursi Kayu'));
  assert.ok(merged.items.some((it) => it.item_name === 'Meja Lesehan'));
});

test('item lama yang sudah tidak ada di spreadsheet tetap dipertahankan', () => {
  const merged = mergeRoItemsForSync(
    [{ id: 'roi-manual', item_name: 'Item Manual', quantity_ordered: 2 }],
    [{ id: 'roi-sheet', item_name: 'Item Sheet', quantity_ordered: 1 }]
  );
  assert.equal(merged.length, 2);
  assert.ok(merged.some((it) => it.item_name === 'Item Manual'));
});

test('item yang di-rename user tetap dipertahankan lewat id yang sama', () => {
  const merged = mergeRoItemsForSync(
    [{ id: 'roi-1', item_name: 'Meja Lesehan Premium', quantity_ordered: 6, notes: 'sudah dicek' }],
    [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6 }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].item_name, 'Meja Lesehan Premium');
  assert.equal(merged[0].notes, 'sudah dicek');
});

test('RO baru dari spreadsheet tidak diubah', () => {
  const order = sheetOrder();
  const merged = mergeRoForSync(order, null);
  assert.equal(merged, order);
});

test('cabang dan gudang mengikuti spreadsheet walau data lama berbeda', () => {
  const merged = mergeRoForSync(
    sheetOrder({ branch_name: 'Warung Nini Kisamaun', warehouse_name: 'Gudang GA' }),
    existingOrder({ branch_name: 'Perlengkapan Tetap', warehouse_name: 'Warung Nini Kisamaun' })
  );

  assert.equal(merged.branch_name, 'Warung Nini Kisamaun');
  assert.equal(merged.warehouse_name, 'Gudang GA');
});

test('unit, harga, total, dan tipe item mengikuti spreadsheet saat data lama salah', () => {
  const merged = mergeRoForSync(
    sheetOrder({
      items: [
        {
          id: 'roi-1',
          item_name: 'Meja Lesehan',
          quantity_ordered: 6,
          unit: 'unit',
          unit_price: 125000,
          total_price: 750000,
          item_type: 'Perlengkapan Tetap',
          stock_source: 'ON_PROSES',
        },
      ],
    }),
    existingOrder({
      items: [
        {
          id: 'roi-1',
          item_name: 'Meja Lesehan',
          quantity_ordered: 6,
          unit: '6',
          unit_price: 0,
          total_price: 750000000,
          item_type: '750000',
          quantity_fulfilled: 4,
          stock_source: 'GUDANG_SCGA',
          notes: 'sudah dicek',
        },
      ],
    })
  );
  const meja = merged.items.find((it) => it.item_name === 'Meja Lesehan');

  assert.equal(meja.unit, 'unit');
  assert.equal(meja.unit_price, 125000);
  assert.equal(meja.total_price, 750000);
  assert.equal(meja.item_type, 'Perlengkapan Tetap');
  assert.equal(meja.quantity_fulfilled, 4);
  assert.equal(meja.stock_source, 'GUDANG_SCGA');
  assert.equal(meja.notes, 'sudah dicek');
});

test('qty pesanan mengikuti sheet selama item belum diproses user', () => {
  const merged = mergeRoForSync(
    sheetOrder({
      items: [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 5, unit: 'unit' }],
    }),
    existingOrder({
      items: [
        {
          id: 'roi-1',
          item_name: 'Meja Lesehan',
          quantity_ordered: 6,
          quantity_fulfilled: 0,
          stock_source: 'ON_PROSES',
        },
      ],
    })
  );
  const meja = merged.items.find((it) => it.item_name === 'Meja Lesehan');
  assert.equal(meja.quantity_ordered, 5);
});

test('qty pesanan item yang sudah diproses user tidak kembali ke sheet', () => {
  const merged = mergeRoForSync(
    sheetOrder({
      items: [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 5, unit: 'unit' }],
    }),
    existingOrder({
      items: [
        {
          id: 'roi-1',
          item_name: 'Meja Lesehan',
          quantity_ordered: 6,
          quantity_fulfilled: 2,
          stock_source: 'GUDANG_SCGA',
        },
      ],
    })
  );
  const meja = merged.items.find((it) => it.item_name === 'Meja Lesehan');
  assert.equal(meja.quantity_ordered, 6);
});

test('item sheet yang hilang dan belum diproses dibuang, item berprogres dipertahankan', () => {
  const merged = mergeRoItemsForSync(
    [
      { id: 'roi-103322-1-1', item_name: 'Item Lama', quantity_fulfilled: 0, stock_source: 'ON_PROSES' },
      { id: 'roi-103322-1-2', item_name: 'Item Berprogres', quantity_fulfilled: 2, stock_source: 'GUDANG_SCGA' },
      { id: 'roi-manual', item_name: 'Item Manual' },
    ],
    [{ id: 'roi-103322-2-1', item_name: 'Item Baru', quantity_ordered: 1 }],
    '103322'
  );

  assert.deepEqual(
    merged.map((it) => it.item_name).sort(),
    ['Item Baru', 'Item Berprogres', 'Item Manual']
  );
});

test('nama item sheet diperbarui jika belum diproses, nama item berprogres dipertahankan', () => {
  const merged = mergeRoItemsForSync(
    [
      { id: 'roi-103322-1-1', item_name: 'Kode Lama', quantity_fulfilled: 0, stock_source: 'ON_PROSES' },
      { id: 'roi-103322-1-2', item_name: 'Nama Lama', quantity_fulfilled: 1, stock_source: 'GUDANG_SCGA' },
    ],
    [
      { id: 'roi-103322-1-1', item_name: 'Nama Baru dari Sheet' },
      { id: 'roi-103322-1-2', item_name: 'Nama Baru Berprogres' },
    ],
    '103322'
  );

  assert.equal(merged.find((it) => it.id === 'roi-103322-1-1').item_name, 'Nama Baru dari Sheet');
  assert.equal(merged.find((it) => it.id === 'roi-103322-1-2').item_name, 'Nama Lama');
});