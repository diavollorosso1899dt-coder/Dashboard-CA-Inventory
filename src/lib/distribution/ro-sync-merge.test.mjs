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