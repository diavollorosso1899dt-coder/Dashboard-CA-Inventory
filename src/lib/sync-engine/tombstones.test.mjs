import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalTombstoneKey,
  loadTombstoneKeys,
  addTombstones,
  removeTombstone,
  removeTombstonesByKeys,
  invalidateTombstoneCache,
} from './tombstones.ts';

/** Klien Supabase palsu yang mencatat operasi dan mengembalikan data tetap. */
function fakeDb(rows = [], options = {}) {
  const calls = [];
  const db = {
    from(table) {
      const state = { table, action: null, filters: {}, payload: null };
      const builder = {
        select() {
          state.action = 'select';
          return builder;
        },
        eq(column, value) {
          state.filters[column] = value;
          return builder;
        },
        in(column, values) {
          state.filters[column] = values;
          return builder;
        },
        order() {
          return builder;
        },
        upsert(payload, opts) {
          state.action = 'upsert';
          state.payload = payload;
          state.options = opts;
          calls.push(state);
          return Promise.resolve({ error: options.upsertError || null });
        },
        delete() {
          state.action = 'delete';
          return builder;
        },
        then(resolve, reject) {
          calls.push(state);
          if (state.action === 'select') {
            return Promise.resolve({ data: rows, error: options.selectError || null }).then(
              resolve,
              reject
            );
          }
          return Promise.resolve({ error: options.deleteError || null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { db, calls };
}

test('kunci tombstone dinormalkan dari berbagai bentuk', () => {
  assert.equal(canonicalTombstoneKey('RO-0005'), '0005');
  assert.equal(canonicalTombstoneKey('ro-0005'), '0005');
  assert.equal(canonicalTombstoneKey('0005'), '0005');
  assert.equal(canonicalTombstoneKey('RO-1.458'), '1458');
  assert.equal(canonicalTombstoneKey('  RO-104066  '), '104066');
  assert.equal(canonicalTombstoneKey('NOID-KALBAR-12'), 'noid-kalbar-12');
  assert.equal(canonicalTombstoneKey(null), '');
  assert.equal(canonicalTombstoneKey(''), '');
});

test('daftar blokir dibaca dari tabel dan di-cache', async () => {
  invalidateTombstoneCache();
  const { db, calls } = fakeDb([{ row_key: '0005' }, { row_key: '104066' }]);

  const first = await loadTombstoneKeys(db, 'request-orders');
  assert.equal(first.has('0005'), true);
  assert.equal(first.has('104066'), true);
  assert.equal(calls.length, 1);

  const second = await loadTombstoneKeys(db, 'request-orders');
  assert.equal(second.has('0005'), true);
  assert.equal(calls.length, 1, 'panggilan kedua memakai cache');
});

test('gagal baca tanpa cache lama menghasilkan daftar kosong', async () => {
  invalidateTombstoneCache();
  const { db } = fakeDb([], { selectError: { message: 'relation does not exist' } });
  const keys = await loadTombstoneKeys(db, 'request-orders');
  assert.equal(keys.size, 0);
});

test('tombstone disimpan dalam bentuk kanonik dan duplikat dibuang', async () => {
  invalidateTombstoneCache();
  const { db, calls } = fakeDb();
  const saved = await addTombstones(
    db,
    'request-orders',
    [
      { key: 'RO-0005', display: 'RO-0005' },
      { key: '0005', display: 'RO-0005' },
      { key: null },
    ],
    { reason: 'Dihapus manual', createdBy: 'Tester' }
  );

  assert.equal(saved, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.length, 1);
  assert.equal(calls[0].payload[0].row_key, '0005');
  assert.equal(calls[0].payload[0].display_key, 'RO-0005');
  assert.equal(calls[0].payload[0].created_by, 'Tester');
  assert.equal(calls[0].options.onConflict, 'source_key,row_key');
});

test('gagal simpan tombstone tidak melempar error', async () => {
  invalidateTombstoneCache();
  const { db } = fakeDb([], { upsertError: { message: 'permission denied' } });
  const saved = await addTombstones(db, 'request-orders', [{ key: 'RO-0007' }]);
  assert.equal(saved, 0);
});

test('melepas blokir mengosongkan cache', async () => {
  invalidateTombstoneCache();
  const { db } = fakeDb();
  const ok = await removeTombstone(db, 'id-1', 'request-orders');
  assert.equal(ok, true);
});

test('klien tidak tersedia berarti daftar kosong', async () => {
  const keys = await loadTombstoneKeys(null, 'request-orders');
  assert.equal(keys.size, 0);
  assert.equal(await addTombstones(null, 'request-orders', [{ key: 'RO-1' }]), 0);
  assert.equal(await removeTombstone(null, 'id-1'), false);
});

test('melepas beberapa blokir sekaligus berdasarkan kunci RO', async () => {
  invalidateTombstoneCache();
  const { db, calls } = fakeDb([
    { id: 't1', row_key: '0005' },
    { id: 't2', row_key: '104066' },
    { id: 't3', row_key: 'lainnya' },
  ]);

  const removed = await removeTombstonesByKeys(db, ['RO-0005', 'ro-104066'], 'request-orders');
  assert.equal(removed, 2);

  const deleteCall = calls.find((call) => call.action === 'delete');
  assert.deepEqual(deleteCall.filters.id, ['t1', 't2']);
});