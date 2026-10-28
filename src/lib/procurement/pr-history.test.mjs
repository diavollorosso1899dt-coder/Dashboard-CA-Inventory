import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPurchaseRequirementHistory,
  matchesPurchaseRequirementFilter,
  mergeManualAssetEdit,
  sanitizeAssetRequestDbPayload,
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

test('sanitizeAssetRequestDbPayload menghapus item_notes agar update Supabase tidak gagal PGRST204', () => {
  const dbPayload = sanitizeAssetRequestDbPayload(
    {
      procurement_status: 'proses',
      pr_datetime: '2026-10-28T00:00:00.000Z',
      notes: 'Sedang negosiasi vendor',
      item_notes: 'Sedang negosiasi vendor',
    },
    '2026-10-28T08:00:00.000Z'
  );

  assert.equal('item_notes' in dbPayload, false);
  assert.equal(dbPayload.procurement_status, 'proses');
  assert.equal(dbPayload.notes, 'Sedang negosiasi vendor');
  assert.equal(dbPayload.is_manually_edited, true);
  assert.equal(dbPayload.updated_at, '2026-10-28T08:00:00.000Z');
});

test('mergeManualAssetEdit mempertahankan procurement_status dan tanggal PR saat sync spreadsheet', () => {
  const sheetRow = {
    external_id: 'JABO-ROW-10',
    procurement_status: 'belum',
    pr_datetime: null,
    po_date: null,
    received_date: null,
    item_delivery_status: 'Belum Proses',
    stock_status: 'Not Ready',
    notes: '',
  };

  const manualEdit = {
    external_id: 'JABO-ROW-10',
    is_manually_edited: true,
    procurement_status: 'proses',
    pr_datetime: '2026-10-28T00:00:00.000Z',
    po_date: '2026-10-29T00:00:00.000Z',
    received_date: null,
    item_delivery_status: 'On Proses',
    stock_status: 'Not Ready',
    notes: 'Follow up vendor',
  };

  const merged = mergeManualAssetEdit(sheetRow, manualEdit);

  assert.equal(merged.procurement_status, 'proses');
  assert.equal(merged.pr_datetime, '2026-10-28T00:00:00.000Z');
  assert.equal(merged.po_date, '2026-10-29T00:00:00.000Z');
  assert.equal(merged.notes, 'Follow up vendor');
  assert.equal(merged.is_manually_edited, true);
});

