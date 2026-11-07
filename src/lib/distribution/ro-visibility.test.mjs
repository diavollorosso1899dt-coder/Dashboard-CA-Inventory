import test from 'node:test';
import assert from 'node:assert/strict';
import { isRoFinalizedForActiveList, isStaleUnprocessedSheetRo } from './ro-visibility.ts';

test('RO on proses tetap tampil di Kelola RO', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'INPUT_SYSTEM',
      current_stage: 'REQUEST_ORDER',
      items: [{ stock_source: 'ON_PROSES' }],
    }),
    false
  );
});

test('RO dengan item Ready Stock tetap tampil di Kelola RO', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'READY_STOCK',
      current_stage: 'READY_STOCK',
      items: [{ stock_source: 'GUDANG_SCGA' }],
    }),
    false
  );
});

test('RO dengan item butuh PR tetap tampil di Kelola RO', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'NEED_PR',
      current_stage: 'KELOLA_PR',
      items: [{ stock_source: 'PR_VENDOR' }],
    }),
    false
  );
});

test('RO yang sudah selesai disembunyikan dari daftar aktif', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'COMPLETED',
      current_stage: 'SELESAI',
      items: [{ stock_source: 'GUDANG_SCGA' }],
    }),
    true
  );
});

test('RO yang dibatalkan disembunyikan', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'REJECTED',
      current_stage: 'DIBATALKAN',
      items: [{ stock_source: 'CANCELLED' }],
    }),
    true
  );
});

test('RO yang semua itemnya dibatalkan disembunyikan', () => {
  assert.equal(
    isRoFinalizedForActiveList({
      status: 'PENDING',
      current_stage: 'REQUEST_ORDER',
      items: [{ stock_source: 'CANCELLED' }, { stock_source: 'CANCELLED' }],
    }),
    true
  );
});

test('RO sheet stale tanpa progres disembunyikan dari daftar aktif', () => {
  assert.equal(
    isStaleUnprocessedSheetRo({
      source_type: 'GOOGLE_SHEET',
      is_stale: true,
      status: 'INPUT_SYSTEM',
      current_stage: 'REQUEST_ORDER',
      items: [{ stock_source: 'ON_PROSES', quantity_fulfilled: 0 }],
    }),
    true
  );
});

test('RO sheet stale yang sudah dialokasikan tetap tampil', () => {
  assert.equal(
    isStaleUnprocessedSheetRo({
      source_type: 'GOOGLE_SHEET',
      is_stale: true,
      status: 'READY_STOCK',
      current_stage: 'READY_STOCK',
      items: [{ stock_source: 'GUDANG_SCGA', quantity_fulfilled: 2 }],
    }),
    false
  );
});

test('RO sheet fresh dan RO manual tidak terpengaruh filter stale', () => {
  assert.equal(
    isStaleUnprocessedSheetRo({
      source_type: 'GOOGLE_SHEET',
      is_stale: false,
      status: 'INPUT_SYSTEM',
      current_stage: 'REQUEST_ORDER',
      items: [{ stock_source: 'ON_PROSES' }],
    }),
    false
  );
  assert.equal(
    isStaleUnprocessedSheetRo({
      source_type: 'MANUAL',
      is_stale: true,
      status: 'INPUT_SYSTEM',
      current_stage: 'REQUEST_ORDER',
      items: [{ stock_source: 'ON_PROSES' }],
    }),
    false
  );
});