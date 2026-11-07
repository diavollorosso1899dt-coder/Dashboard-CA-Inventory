import test from 'node:test';
import assert from 'node:assert/strict';
import { applySheetRoDates } from './ro-sheet-dates.ts';

test('tanggal sheet menimpa tanggal lama yang salah', () => {
  const merged = { request_date: '2026-11-24', target_delivery_date: '2026-11-24', status: 'NEED_PR' };
  const sheet = { request_date: '2026-11-05', target_delivery_date: '2026-11-24' };

  const result = applySheetRoDates(merged, sheet);

  assert.equal(result.request_date, '2026-11-05');
  assert.equal(result.target_delivery_date, '2026-11-24');
});

test('tanggal input dan tanggal permintaan dipetakan terpisah', () => {
  const result = applySheetRoDates(
    { request_date: '2026-10-30', target_delivery_date: '2026-11-06' },
    { request_date: '2026-10-31', target_delivery_date: '2026-11-07' }
  );

  assert.equal(result.request_date, '2026-10-31');
  assert.equal(result.target_delivery_date, '2026-11-07');
});

test('tanggal sheet yang kosong tidak menghapus nilai lama', () => {
  const result = applySheetRoDates(
    { request_date: '2026-11-05', target_delivery_date: '2026-11-20' },
    { request_date: '2026-11-05', target_delivery_date: null }
  );

  assert.equal(result.target_delivery_date, '2026-11-20');
});

test('field lain pada hasil merge tidak berubah', () => {
  const merged = {
    request_date: '2026-11-24',
    target_delivery_date: '2026-11-24',
    status: 'READY_STOCK',
    current_stage: 'READY_STOCK',
    notes: '[PROCESSED_FROM_RO]',
  };

  const result = applySheetRoDates(merged, {
    request_date: '2026-11-05',
    target_delivery_date: '2026-11-24',
  });

  assert.equal(result.status, 'READY_STOCK');
  assert.equal(result.current_stage, 'READY_STOCK');
  assert.equal(result.notes, '[PROCESSED_FROM_RO]');
});

test('objek asli tidak dimutasi', () => {
  const merged = { request_date: '2026-11-24', target_delivery_date: '2026-11-24' };
  applySheetRoDates(merged, { request_date: '2026-11-05' });

  assert.equal(merged.request_date, '2026-11-24');
});