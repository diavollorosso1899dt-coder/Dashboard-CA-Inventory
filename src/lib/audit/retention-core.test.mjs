import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_BATCH_SIZE,
  MAX_BATCHES,
  purgeOlderThan,
} from './retention-core.ts';

const CUTOFF = '2026-10-28T00:00:00.000Z';

function oldRow(n) {
  return { id: `old-${n}`, timestamp: `2026-10-${String((n % 27) + 1).padStart(2, '0')}T00:00:00.000Z` };
}

function newRow(n) {
  return { id: `new-${n}`, timestamp: `2026-11-0${(n % 3) + 1}T00:00:00.000Z` };
}

function makeClient(rows) {
  const state = { rows, deleteCalls: 0, listCalls: 0 };
  return {
    state,
    async countOlderThan(cutoff) {
      return { count: state.rows.filter((r) => r.timestamp < cutoff).length };
    },
    async listIdsOlderThan(cutoff, limit) {
      state.listCalls += 1;
      const ids = state.rows
        .filter((r) => r.timestamp < cutoff)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(0, limit)
        .map((r) => r.id);
      return { ids };
    },
    async deleteByIds(ids) {
      state.deleteCalls += 1;
      const set = new Set(ids);
      state.rows = state.rows.filter((r) => !set.has(r.id));
      return {};
    },
  };
}

test('dryRun hanya menghitung, tidak menghapus', async () => {
  const client = makeClient([oldRow(1), oldRow(2), newRow(1)]);
  const result = await purgeOlderThan(client, CUTOFF, { dryRun: true });
  assert.equal(result.matched, 2);
  assert.equal(result.deleted, 0);
  assert.equal(client.state.deleteCalls, 0);
  assert.equal(client.state.rows.length, 3);
});

test('menghapus hanya log yang lebih tua dari cutoff', async () => {
  const client = makeClient([oldRow(1), oldRow(2), oldRow(3), newRow(1), newRow(2)]);
  const result = await purgeOlderThan(client, CUTOFF);
  assert.equal(result.matched, 3);
  assert.equal(result.deleted, 3);
  assert.equal(result.error, undefined);
  assert.deepEqual(
    client.state.rows.map((r) => r.id).sort(),
    ['new-1', 'new-2']
  );
});

test('log baru tidak ikut terhapus saat dijalankan berulang', async () => {
  const client = makeClient([oldRow(1), newRow(1)]);
  await purgeOlderThan(client, CUTOFF);
  const second = await purgeOlderThan(client, CUTOFF);
  assert.equal(second.matched, 0);
  assert.equal(second.deleted, 0);
  assert.equal(client.state.rows.length, 1);
});

test('menghapus per batch saat jumlah log besar', async () => {
  const total = DELETE_BATCH_SIZE * 2 + 200;
  const rows = Array.from({ length: total }, (_, i) => oldRow(i));
  const client = makeClient(rows);
  const result = await purgeOlderThan(client, CUTOFF);
  assert.equal(result.matched, total);
  assert.equal(result.deleted, total);
  assert.equal(result.batches, 3);
  assert.equal(client.state.rows.length, 0);
});

test('berhenti di batas MAX_BATCHES, sisa dihapus pada pemanggilan berikutnya', async () => {
  const total = DELETE_BATCH_SIZE * MAX_BATCHES + 100;
  const rows = Array.from({ length: total }, (_, i) => oldRow(i));
  const client = makeClient(rows);
  const first = await purgeOlderThan(client, CUTOFF);
  assert.equal(first.deleted, DELETE_BATCH_SIZE * MAX_BATCHES);
  assert.equal(client.state.rows.length, 100);

  const second = await purgeOlderThan(client, CUTOFF);
  assert.equal(second.deleted, 100);
  assert.equal(client.state.rows.length, 0);
});

test('error saat hapus mengembalikan jumlah yang sudah terhapus', async () => {
  const client = makeClient([oldRow(1), oldRow(2)]);
  client.deleteByIds = async () => ({ error: 'koneksi terputus' });
  const result = await purgeOlderThan(client, CUTOFF);
  assert.equal(result.matched, 2);
  assert.equal(result.deleted, 0);
  assert.equal(result.error, 'koneksi terputus');
});

test('error saat hitung tidak menghapus apa pun', async () => {
  const client = makeClient([oldRow(1)]);
  client.countOlderThan = async () => ({ count: null, error: 'gagal hitung' });
  const result = await purgeOlderThan(client, CUTOFF);
  assert.equal(result.matched, 0);
  assert.equal(result.deleted, 0);
  assert.equal(result.error, 'gagal hitung');
  assert.equal(client.state.deleteCalls, 0);
});