import test from 'node:test';
import assert from 'node:assert/strict';
import { runSync } from './engine.ts';

function makeStore(overrides = {}) {
  const state = { created: [], sources: [], finished: [], running: null };
  return {
    state,
    async findRunning() {
      return state.running;
    },
    async expireRun() {},
    async createRun(input) {
      const run = { id: 'run-1', status: 'RUNNING', ...input };
      state.created.push(run);
      return run;
    },
    async finishRun(id, patch) {
      state.finished.push({ id, ...patch });
    },
    async recordSource(runId, result) {
      state.sources.push({ runId, ...result });
    },
    async lastRunStartedAt() {
      return overrides.lastRunStartedAt ?? null;
    },
    async getStatus() {
      return null;
    },
    async getHistory() {
      return [];
    },
  };
}

function makeSource(key, dependsOn, runImpl) {
  return {
    key,
    label: key,
    dependsOn,
    async run(ctx) {
      return (
        (runImpl && runImpl(ctx)) || {
          status: 'SUCCESS',
          rowsFetched: 1,
          rowsInserted: 1,
          rowsUpdated: 0,
          rowsSkipped: 0,
          rowsStale: 0,
        }
      );
    },
  };
}

const baseSources = [
  makeSource('asset-requests', []),
  makeSource('request-orders', []),
  makeSource('master-catalog', ['asset-requests']),
];

test('menjalankan semua sumber dan mencatat hasil', async () => {
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.sources.length, 3);
  assert.equal(store.state.created.length, 1);
  assert.equal(store.state.sources.length, 3);
  assert.equal(store.state.finished.length, 1);
});

test('sumber turunan SKIPPED bila dependensi gagal', async () => {
  const sources = [
    makeSource('asset-requests', [], async () => ({
      status: 'FAILED',
      rowsFetched: 0,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsStale: 0,
      message: 'sheet gagal',
    })),
    makeSource('request-orders', []),
    makeSource('master-catalog', ['asset-requests']),
  ];
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'PARTIAL');
  const master = result.sources.find((s) => s.key === 'master-catalog');
  assert.equal(master.status, 'SKIPPED');
});

test('error tak terduga menjadi FAILED dan run tetap ditutup', async () => {
  const sources = [
    makeSource('asset-requests', [], async () => {
      throw new Error('boom');
    }),
  ];
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL', sources: ['asset-requests'] },
    { store, sources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.status, 'FAILED');
  assert.equal(store.state.finished.length, 1);
});

test('dry-run tidak membuat run atau menulis riwayat', async () => {
  const store = makeStore();
  const result = await runSync(
    { trigger: 'MANUAL', dryRun: true },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.dryRun, true);
  assert.equal(store.state.created.length, 0);
  assert.equal(store.state.sources.length, 0);
});

test('webhook dalam 5 menit di-debounce', async () => {
  const store = makeStore({ lastRunStartedAt: '2026-11-05T09:58:00.000Z' });
  const result = await runSync(
    { trigger: 'WEBHOOK' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'debounced');
  assert.equal(store.state.created.length, 0);
});

test('lock aktif mengembalikan 409-style result', async () => {
  const store = makeStore();
  store.state.running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:59:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const result = await runSync(
    { trigger: 'MANUAL' },
    { store, sources: baseSources, now: () => new Date('2026-11-05T10:00:00.000Z') }
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'locked');
});