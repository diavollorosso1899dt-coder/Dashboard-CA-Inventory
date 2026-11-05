import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_DEFINITIONS, resolveSourceOrder } from './registry.ts';

test('registry mendefinisikan tiga sumber', () => {
  assert.deepEqual(
    SOURCE_DEFINITIONS.map((s) => s.key),
    ['asset-requests', 'request-orders', 'master-catalog']
  );
});

test('tanpa permintaan berarti semua sumber', () => {
  assert.deepEqual(resolveSourceOrder(), {
    keys: ['asset-requests', 'request-orders', 'master-catalog'],
  });
});

test('dependensi ikut dimasukkan otomatis', () => {
  assert.deepEqual(resolveSourceOrder(['master-catalog']), {
    keys: ['asset-requests', 'master-catalog'],
  });
});

test('urutan mengikuti dependensi walau diminta terbalik', () => {
  assert.deepEqual(resolveSourceOrder(['master-catalog', 'asset-requests']), {
    keys: ['asset-requests', 'master-catalog'],
  });
});

test('sumber tidak dikenal ditolak', () => {
  const result = resolveSourceOrder(['asset-requests', 'tidak-ada']);
  assert.match(result.error, /tidak-ada/);
});

test('permintaan kosong dianggap semua sumber', () => {
  assert.deepEqual(resolveSourceOrder([]).keys, [
    'asset-requests',
    'request-orders',
    'master-catalog',
  ]);
});