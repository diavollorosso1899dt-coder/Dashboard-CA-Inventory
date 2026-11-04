import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_LOG_RETENTION_DAYS,
  normalizeRetentionDays,
  computeAuditLogCutoff,
} from './retention-config.ts';

test('retensi default adalah 7 hari', () => {
  assert.equal(AUDIT_LOG_RETENTION_DAYS, 7);
});

test('nilai retensi tidak valid kembali ke default', () => {
  assert.equal(normalizeRetentionDays(undefined), 7);
  assert.equal(normalizeRetentionDays(null), 7);
  assert.equal(normalizeRetentionDays(0), 7);
  assert.equal(normalizeRetentionDays(-3), 7);
  assert.equal(normalizeRetentionDays(Number.NaN), 7);
});

test('nilai retensi dibatasi 1..3650 hari', () => {
  assert.equal(normalizeRetentionDays(1), 1);
  assert.equal(normalizeRetentionDays(14.9), 14);
  assert.equal(normalizeRetentionDays(99999), 3650);
});

test('cutoff tepat 7 hari ke belakang', () => {
  const now = Date.UTC(2026, 10, 4, 8, 0, 0); // 2026-11-04T08:00:00Z
  const cutoff = computeAuditLogCutoff(7, now);
  assert.equal(cutoff, '2026-10-28T08:00:00.000Z');
});

test('cutoff memakai nilai retensi yang sudah dinormalisasi', () => {
  const now = Date.UTC(2026, 10, 4, 8, 0, 0);
  assert.equal(computeAuditLogCutoff(0, now), '2026-10-28T08:00:00.000Z');
  assert.equal(computeAuditLogCutoff(1, now), '2026-11-03T08:00:00.000Z');
});