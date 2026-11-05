import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaHint, storeError, SYNC_SCHEMA_HINT } from './store-error.ts';

test('pesan tabel belum ada diterjemahkan menjadi instruksi migrasi', () => {
  assert.equal(
    schemaHint('Could not find the table public.sync_runs in the schema cache'),
    SYNC_SCHEMA_HINT
  );
});

test('pesan lain dibiarkan apa adanya', () => {
  assert.equal(schemaHint('duplicate key value violates unique constraint'), 'duplicate key value violates unique constraint');
});

test('unique violation mempertahankan kode 23505 untuk deteksi lock', () => {
  const original = {
    message: 'duplicate key value violates unique constraint "uniq_sync_runs_running"',
    code: '23505',
  };
  const error = storeError(original);
  assert.equal(error.code, '23505');
  assert.equal(error.message, original.message);
});

test('error skema dibungkus tanpa kode asli', () => {
  const error = storeError({
    message: 'relation "public.sync_runs" does not exist',
    code: '42P01',
  });
  assert.equal(error.message, SYNC_SCHEMA_HINT);
  assert.equal(error.code, undefined);
});