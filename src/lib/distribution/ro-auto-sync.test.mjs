import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoStatusSnapshot, shouldAutoSync } from './ro-auto-sync.ts';

test('snapshot memakai source request-orders sukses terbaru', () => {
  const snapshot = readRoStatusSnapshot({
    running: null,
    runs: [
      {
        started_at: '2026-11-12T10:00:00.000Z',
        status: 'SUCCESS',
        dry_run: false,
      },
    ],
    sources: [
      {
        source_key: 'asset-requests',
        status: 'SUCCESS',
        finished_at: '2026-11-12T10:00:05.000Z',
      },
      {
        source_key: 'request-orders',
        status: 'SUCCESS',
        finished_at: '2026-11-12T10:00:03.000Z',
      },
    ],
  });

  assert.equal(snapshot.running, false);
  assert.equal(snapshot.lastSyncAt, '2026-11-12T10:00:03.000Z');
});

test('snapshot menandai run yang masih berjalan', () => {
  const snapshot = readRoStatusSnapshot({
    running: { id: 'run-aktif' },
    runs: [],
    sources: [],
  });

  assert.equal(snapshot.running, true);
});

test('snapshot fallback ke run selesai non-dry-run terbaru', () => {
  const snapshot = readRoStatusSnapshot({
    runs: [
      {
        started_at: '2026-11-12T10:05:00.000Z',
        status: 'SUCCESS',
        dry_run: true,
      },
      {
        started_at: '2026-11-12T10:00:00.000Z',
        status: 'SUCCESS',
        dry_run: false,
      },
      {
        started_at: '2026-11-12T09:00:00.000Z',
        status: 'SUCCESS',
        dry_run: false,
      },
    ],
    sources: [],
  });

  assert.equal(snapshot.lastSyncAt, '2026-11-12T10:00:00.000Z');
});

test('snapshot fallback tidak memakai run yang gagal', () => {
  const snapshot = readRoStatusSnapshot({
    runs: [
      {
        started_at: '2026-11-12T10:05:00.000Z',
        status: 'FAILED',
        dry_run: false,
      },
      {
        started_at: '2026-11-12T10:00:00.000Z',
        status: 'SUCCESS',
        dry_run: false,
      },
    ],
    sources: [],
  });

  assert.equal(snapshot.lastSyncAt, '2026-11-12T10:00:00.000Z');
});

test('auto-sync berjalan bila belum pernah ada sync RO', () => {
  const now = new Date('2026-11-12T10:05:00.000Z');
  assert.equal(shouldAutoSync({ running: false, lastSyncAt: null }, now), true);
});

test('auto-sync menunggu bila sync RO terakhir masih dalam 1 menit', () => {
  const now = new Date('2026-11-12T10:05:00.000Z');
  assert.equal(
    shouldAutoSync({ running: false, lastSyncAt: '2026-11-12T10:04:30.000Z' }, now),
    false
  );
});

test('auto-sync berjalan bila sync RO terakhir sudah lewat 1 menit', () => {
  const now = new Date('2026-11-12T10:05:00.000Z');
  assert.equal(
    shouldAutoSync({ running: false, lastSyncAt: '2026-11-12T10:03:00.000Z' }, now),
    true
  );
});

test('auto-sync tidak berjalan saat masih ada run aktif', () => {
  const now = new Date('2026-11-12T10:05:00.000Z');
  assert.equal(shouldAutoSync({ running: true, lastSyncAt: null }, now), false);
});

test('auto-sync berjalan bila timestamp sync tidak valid', () => {
  const now = new Date('2026-11-12T10:05:00.000Z');
  assert.equal(shouldAutoSync({ running: false, lastSyncAt: 'bukan-tanggal' }, now), true);
});
