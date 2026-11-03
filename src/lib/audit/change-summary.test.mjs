import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatValue,
  inferActionType,
  summarizeChanges,
  summarizeItemChanges,
} from './change-summary.ts';

const ro = (overrides = {}) => ({
  id: 'ro-1',
  ro_number: 'RO-103322',
  branch_name: 'Mie Ayam Muntjul Dansen',
  status: 'INPUT_SYSTEM',
  current_stage: 'REQUEST_ORDER',
  notes: '',
  items: [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, stock_source: 'ON_PROSES' }],
  ...overrides,
});

test('status dan tahap RO yang berubah tercatat lengkap', () => {
  const summary = summarizeChanges(ro(), ro({ status: 'READY_STOCK', current_stage: 'READY_STOCK' }));
  assert.deepEqual(summary.changedKeys.sort(), ['current_stage', 'status']);
  assert.equal(summary.details.includes('Status: Input Sistem \u2192 Ready Stock'), true);
  assert.equal(summary.previousState.status, 'INPUT_SYSTEM');
  assert.equal(summary.newState.status, 'READY_STOCK');
  assert.equal(inferActionType(ro(), summary), 'STATUS_CHANGE');
});

test('tidak ada perubahan berarti tidak menghasilkan log', () => {
  const summary = summarizeChanges(ro(), ro());
  assert.deepEqual(summary.changedKeys, []);
  assert.equal(summary.details, '');
  assert.equal(summary.previousState, undefined);
});

test('alokasi item Ready Stock tercatat per item', () => {
  const summary = summarizeChanges(
    ro(),
    ro({
      items: [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, stock_source: 'GUDANG_SCGA' }],
    })
  );
  assert.deepEqual(summary.changedKeys, ['items']);
  assert.equal(summary.details.includes('Meja Lesehan'), true);
  assert.equal(summary.details.includes('On Proses \u2192 Ready Stock (Gudang SCGA)'), true);
  assert.equal(inferActionType(ro(), summary), 'STATUS_CHANGE');
});

test('item baru dan item yang dihapus ikut tercatat', () => {
  const detail = summarizeItemChanges(
    [{ id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, stock_source: 'ON_PROSES' }],
    [
      { id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, stock_source: 'ON_PROSES' },
      { id: 'roi-2', item_name: 'Kursi Kayu', quantity_ordered: 40, stock_source: 'ON_PROSES' },
    ]
  );
  assert.equal(detail.includes('+ item "Kursi Kayu"'), true);
});

test('catatan RO yang diubah tercatat sebagai perubahan biasa', () => {
  const summary = summarizeChanges(ro({ notes: '' }), ro({ notes: 'Catatan user' }));
  assert.deepEqual(summary.changedKeys, ['notes']);
  assert.equal(summary.details.includes('Catatan: (kosong) \u2192 Catatan user'), true);
  assert.equal(inferActionType(ro(), summary), 'UPDATE');
});

test('formatValue memakai label yang mudah dibaca', () => {
  assert.equal(formatValue('stock_source', 'PR_VENDOR'), 'Butuh PR Vendor');
  assert.equal(formatValue('notes', ''), '(kosong)');
  assert.equal(formatValue('quantity_ordered', 6), '6');
});

test('perubahan tanggal pengiriman tercatat', () => {
  const summary = summarizeChanges(
    ro({ target_delivery_date: null }),
    ro({ target_delivery_date: '2026-11-20' })
  );
  assert.deepEqual(summary.changedKeys, ['target_delivery_date']);
  assert.equal(summary.details.includes('Target Kirim: (kosong) \u2192 2026-11-20'), true);
});