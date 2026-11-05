import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRunStatus, isRunExpired } from './status.ts';

const ok = { status: 'SUCCESS' };
const failed = { status: 'FAILED' };
const skipped = { status: 'SKIPPED' };

test('semua sukses menjadi SUCCESS', () => {
  assert.equal(aggregateRunStatus([ok, ok]), 'SUCCESS');
});

test('sebagian gagal menjadi PARTIAL', () => {
  assert.equal(aggregateRunStatus([ok, failed]), 'PARTIAL');
});

test('semua gagal menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([failed, failed]), 'FAILED');
});

test('tidak ada hasil menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([]), 'FAILED');
});

test('sukses dengan skipped tetap SUCCESS', () => {
  assert.equal(aggregateRunStatus([ok, skipped]), 'SUCCESS');
});

test('hanya skipped menjadi FAILED', () => {
  assert.equal(aggregateRunStatus([skipped]), 'FAILED');
});

test('run lebih tua dari 15 menit dianggap kedaluwarsa', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(isRunExpired('2026-11-05T09:44:59.000Z', now), true);
  assert.equal(isRunExpired('2026-11-05T09:45:01.000Z', now), false);
});