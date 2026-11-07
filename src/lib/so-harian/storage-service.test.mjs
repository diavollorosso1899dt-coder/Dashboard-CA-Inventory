import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSessionCache } from './storageService.ts';

const session = (id, tanggal, extra = {}) => ({
  id,
  tanggal,
  gudang: 'Gudang Uji',
  petugas: 'Petugas',
  ...extra,
});

test('sesi dari cloud menimpa sesi lokal dengan id yang sama', () => {
  const merged = mergeSessionCache(
    [session('so-jabodetabek-2026-11-06', '2026-11-06', { status: 'DRAFT', total_items: 1 })],
    [session('so-jabodetabek-2026-11-06', '2026-11-06', { status: 'COMPLETED', total_items: 2 })]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'COMPLETED');
  assert.equal(merged[0].total_items, 2);
});

test('sesi lokal yang belum ada di cloud tetap dipertahankan', () => {
  const merged = mergeSessionCache(
    [
      session('so-kalbar-2026-11-05', '2026-11-05'),
      session('so-kalbar-2026-11-06', '2026-11-06'),
    ],
    [session('so-jabodetabek-2026-11-06', '2026-11-06')]
  );

  assert.deepEqual(
    merged.map((s) => s.id).sort(),
    ['so-jabodetabek-2026-11-06', 'so-kalbar-2026-11-05', 'so-kalbar-2026-11-06']
  );
});

test('daftar gabungan diurutkan dari tanggal terbaru', () => {
  const merged = mergeSessionCache(
    [session('a', '2026-11-04'), session('b', '2026-11-06')],
    [session('c', '2026-11-05')]
  );

  assert.deepEqual(
    merged.map((s) => s.tanggal),
    ['2026-11-06', '2026-11-05', '2026-11-04']
  );
});

test('sesi tanpa tanggal diletakkan paling akhir', () => {
  const merged = mergeSessionCache([], [session('a', '2026-11-06'), session('b', null)]);

  assert.deepEqual(
    merged.map((s) => s.id),
    ['a', 'b']
  );
});