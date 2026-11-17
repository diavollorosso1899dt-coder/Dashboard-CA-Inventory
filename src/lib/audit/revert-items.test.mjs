import test from 'node:test';
import assert from 'node:assert/strict';
import { diffChangedItems, mergeRevertedItems } from './revert-items.ts';

const item = (overrides = {}) => ({
  id: 'roi-1',
  item_name: 'Gelas Karyawan',
  stock_source: 'ON_PROSES',
  quantity_ordered: 35,
  quantity_fulfilled: 0,
  notes: '',
  ...overrides,
});

test('diffChangedItems hanya mengembalikan item yang field-nya berubah', () => {
  const previous = [
    item(),
    item({ id: 'roi-2', item_name: 'Baskom Seng', stock_source: 'GUDANG_SCGA' }),
  ];
  const current = [
    item({ stock_source: 'GUDANG_SCGA' }),
    item({ id: 'roi-2', item_name: 'Baskom Seng', stock_source: 'GUDANG_SCGA' }),
  ];

  const changed = diffChangedItems(previous, current);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].itemName, 'Gelas Karyawan');
  assert.deepEqual(
    changed[0].fields.map((field) => field.field),
    ['stock_source']
  );
  assert.equal(changed[0].fields[0].previousValue, 'ON_PROSES');
  assert.equal(changed[0].fields[0].currentValue, 'GUDANG_SCGA');
});

test('diffChangedItems mencocokkan item lewat nama bila id tidak ada', () => {
  const previous = [{ item_name: 'Meja Lesehan', stock_source: 'ON_PROSES' }];
  const current = [{ item_name: 'Meja Lesehan', stock_source: 'PR_VENDOR' }];

  const changed = diffChangedItems(previous, current);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].key, 'name:meja lesehan');
  assert.equal(changed[0].fields[0].field, 'stock_source');
});

test('diffChangedItems mengabaikan item yang sama persis dan item yang hanya ada di satu sisi', () => {
  const previous = [
    item(),
    item({ id: 'roi-2', item_name: 'Kursi Kayu' }),
    item({ id: 'roi-3', item_name: 'Item Dihapus' }),
  ];
  const current = [
    item(),
    item({ id: 'roi-2', item_name: 'Kursi Kayu' }),
    item({ id: 'roi-4', item_name: 'Item Baru' }),
  ];

  assert.deepEqual(diffChangedItems(previous, current), []);
});

test('mergeRevertedItems memulihkan field yang berubah tanpa menimpa progres lain', () => {
  const previous = [item({ stock_source: 'ON_PROSES', notes: 'Catatan lama' })];
  const current = [item({ stock_source: 'GUDANG_SCGA', notes: 'Catatan baru' })];
  const changed = diffChangedItems(previous, current);

  const live = [
    item({
      stock_source: 'PR_VENDOR',
      notes: 'Catatan baru',
      quantity_fulfilled: 20,
      received_qty: 20,
    }),
  ];

  const result = mergeRevertedItems(live, changed, [changed[0].key]);
  assert.deepEqual(result.appliedKeys, [changed[0].key]);
  assert.deepEqual(result.skippedKeys, []);
  assert.equal(result.items[0].stock_source, 'ON_PROSES');
  assert.equal(result.items[0].notes, 'Catatan lama');
  assert.equal(result.items[0].quantity_fulfilled, 20);
  assert.equal(result.items[0].received_qty, 20);
});

test('mergeRevertedItems mempertahankan field yang tidak berubah pada log', () => {
  const previous = [item({ stock_source: 'ON_PROSES', notes: 'Lama' })];
  const current = [item({ stock_source: 'GUDANG_SCGA', notes: 'Lama' })];
  const changed = diffChangedItems(previous, current);

  const live = [item({ stock_source: 'GUDANG_SCGA', notes: 'Lama', quantity_fulfilled: 12 })];
  const result = mergeRevertedItems(live, changed, [changed[0].key]);

  assert.equal(result.items[0].stock_source, 'ON_PROSES');
  assert.equal(result.items[0].notes, 'Lama');
  assert.equal(result.items[0].quantity_fulfilled, 12);
});

test('mergeRevertedItems melewati item yang sudah tidak ada di data aktif', () => {
  const previous = [item()];
  const current = [item({ stock_source: 'GUDANG_SCGA' })];
  const changed = diffChangedItems(previous, current);

  const result = mergeRevertedItems([], changed, [changed[0].key]);
  assert.deepEqual(result.appliedKeys, []);
  assert.deepEqual(result.skippedKeys, [changed[0].key]);
});

test('mergeRevertedItems tidak mengubah array input', () => {
  const previous = [item()];
  const current = [item({ stock_source: 'GUDANG_SCGA' })];
  const changed = diffChangedItems(previous, current);
  const live = [item({ stock_source: 'PR_VENDOR' })];

  const result = mergeRevertedItems(live, changed, [changed[0].key]);
  assert.equal(live[0].stock_source, 'PR_VENDOR');
  assert.equal(result.items[0].stock_source, 'ON_PROSES');
  assert.notEqual(result.items[0], live[0]);
});
