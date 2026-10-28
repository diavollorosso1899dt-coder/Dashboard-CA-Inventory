import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPurchaseRequirementHistory,
  matchesPurchaseRequirementFilter,
} from './pr-history.ts';

const prItem = (overrides = {}) => ({
  procurement_status: 'proses',
  item_delivery_status: 'On Proses',
  stock_status: 'Not Ready (Stok Kosong)',
  quantity_pr: 1,
  ...overrides,
});

test('filter PR aktif mengecualikan aset yang sudah selesai', () => {
  const completed = prItem({
    procurement_status: 'selesai',
    item_delivery_status: 'Ready Antar',
    stock_status: 'Ready Stock (Gudang SCGA)',
  });

  assert.equal(matchesPurchaseRequirementFilter(completed, false), false);
});

test('filter PR aktif mengecualikan item yang sudah ready walau status belum selesai', () => {
  const ready = prItem({
    item_delivery_status: 'Ready Antar',
  });

  assert.equal(matchesPurchaseRequirementFilter(ready, false), false);
});

test('mode riwayat memasukkan aset selesai tanpa melihat status distribusi', () => {
  const completed = prItem({
    procurement_status: 'selesai',
    item_delivery_status: 'Terima Outlet',
    stock_status: 'Ready Stock (Gudang SCGA)',
  });

  assert.equal(matchesPurchaseRequirementFilter(completed, true), true);
});

test('filter riwayat hanya mengembalikan aset berstatus selesai', () => {
  const items = [
    prItem({ procurement_status: 'selesai' }),
    prItem({ procurement_status: 'proses' }),
    prItem({ procurement_status: 'po' }),
    prItem({ procurement_status: 'selesai' }),
  ];

  const result = filterPurchaseRequirementHistory(items);

  assert.equal(result.length, 2);
  assert.ok(result.every((item) => item.procurement_status === 'selesai'));
});
