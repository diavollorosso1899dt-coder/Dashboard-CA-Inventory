import test from 'node:test';
import assert from 'node:assert/strict';
import { staleRegionScope } from './stale.ts';

test('kedua region sehat berarti scope ALL', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: true, count: 10 },
      KALBAR: { ok: true, count: 20 },
    }),
    'ALL'
  );
});

test('hanya JABO sehat berarti scope JABODETABEK', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: true, count: 10 },
      KALBAR: { ok: false, count: 0, error: 'HTTP 500' },
    }),
    'JABODETABEK'
  );
});

test('hanya KALBAR sehat berarti scope KALBAR', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: false, count: 0 },
      KALBAR: { ok: true, count: 20 },
    }),
    'KALBAR'
  );
});

test('kedua region gagal berarti NONE', () => {
  assert.equal(
    staleRegionScope({
      JABODETABEK: { ok: false, count: 0 },
      KALBAR: { ok: false, count: 0 },
    }),
    'NONE'
  );
});

test('region tidak diketahui berarti NONE', () => {
  assert.equal(staleRegionScope({}), 'NONE');
});