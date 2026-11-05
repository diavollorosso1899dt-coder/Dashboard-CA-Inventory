import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireRun } from './lock.ts';

function makeStore(running = null) {
  const state = {
    running,
    expired: [],
    created: [],
  };
  return {
    state,
    async findRunning() {
      return state.running;
    },
    async expireRun(id, finishedAt, message) {
      state.expired.push({ id, finishedAt, message });
      state.running = null;
    },
    async createRun(input) {
      const run = { id: 'run-baru', status: 'RUNNING', ...input };
      state.created.push(run);
      state.running = run;
      return run;
    },
    async finishRun() {},
    async recordSource() {},
    async lastRunStartedAt() {
      return null;
    },
    async getStatus() {
      return null;
    },
    async getHistory() {
      return [];
    },
  };
}

const input = {
  trigger: 'MANUAL',
  dryRun: false,
  actorName: 'Tester',
  totalSources: 3,
};

test('lock berhasil saat tidak ada run aktif', async () => {
  const store = makeStore();
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(result.run.id, 'run-baru');
});

test('lock menolak saat run aktif masih segar', async () => {
  const running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:55:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const store = makeStore(running);
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'locked');
});

test('run kedaluwarsa di-expire lalu run baru dibuat', async () => {
  const running = {
    id: 'run-lama',
    started_at: '2026-11-05T09:30:00.000Z',
    status: 'RUNNING',
    trigger: 'MANUAL',
    dry_run: false,
  };
  const store = makeStore(running);
  const result = await acquireRun(store, input, new Date('2026-11-05T10:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(store.state.expired.length, 1);
  assert.equal(store.state.expired[0].id, 'run-lama');
});