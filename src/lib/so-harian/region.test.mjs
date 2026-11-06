import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSoRegion,
  soRegionSlug,
  buildSoSessionId,
  parseSoSessionId,
  resolveSessionRegion,
  filterSessionsByRegion,
  resolveActiveSoRegion,
} from './region.ts';
import { matchesRegion } from '../utils/region-helper.ts';

test('normalizeSoRegion menerima variasi nama region dan menolak ALL', () => {
  assert.equal(normalizeSoRegion('JABO'), 'JABODETABEK');
  assert.equal(normalizeSoRegion('jabodetabek'), 'JABODETABEK');
  assert.equal(normalizeSoRegion(' KALBAR '), 'KALBAR');
  assert.equal(normalizeSoRegion('Kalimantan Barat'), 'KALBAR');
  assert.equal(normalizeSoRegion('ALL'), null);
  assert.equal(normalizeSoRegion(''), null);
  assert.equal(normalizeSoRegion(null), null);
});

test('slug dan ID sesi memisahkan dua region pada tanggal yang sama', () => {
  assert.equal(soRegionSlug('JABODETABEK'), 'jabodetabek');
  assert.equal(soRegionSlug('KALBAR'), 'kalbar');
  assert.equal(buildSoSessionId('JABODETABEK', '2026-11-06'), 'so-jabodetabek-2026-11-06');
  assert.equal(buildSoSessionId('KALBAR', '2026-11-06'), 'so-kalbar-2026-11-06');
});

test('parseSoSessionId mengenali sesi region dan sesi legacy', () => {
  assert.deepEqual(parseSoSessionId('so-jabodetabek-2026-11-06'), {
    region: 'JABODETABEK',
    date: '2026-11-06',
    legacy: false,
  });
  assert.deepEqual(parseSoSessionId('so-kalbar-2026-11-06'), {
    region: 'KALBAR',
    date: '2026-11-06',
    legacy: false,
  });
  assert.deepEqual(parseSoSessionId('so-2026-11-06'), {
    region: null,
    date: '2026-11-06',
    legacy: true,
  });
  assert.deepEqual(parseSoSessionId('sesi-lain'), {
    region: null,
    date: null,
    legacy: false,
  });
});

test('resolveSessionRegion memprioritaskan kolom region lalu ID', () => {
  assert.equal(resolveSessionRegion({ region: 'KALBAR', id: 'so-jabodetabek-2026-11-06' }), 'KALBAR');
  assert.equal(resolveSessionRegion({ region: null, id: 'so-kalbar-2026-11-06' }), 'KALBAR');
  assert.equal(resolveSessionRegion({ region: 'ALL', id: 'so-jabodetabek-2026-11-06' }), 'JABODETABEK');
  assert.equal(resolveSessionRegion({ id: 'so-2026-11-06' }), null);
});

test('filterSessionsByRegion tidak mencampur region dan mengabaikan legacy', () => {
  const sessions = [
    { id: 'so-jabodetabek-2026-11-06', tanggal: '2026-11-06' },
    { id: 'so-kalbar-2026-11-06', tanggal: '2026-11-06' },
    { id: 'so-2026-11-05', tanggal: '2026-11-05' },
  ];

  assert.deepEqual(
    filterSessionsByRegion(sessions, 'JABODETABEK').map((s) => s.id),
    ['so-jabodetabek-2026-11-06']
  );
  assert.deepEqual(
    filterSessionsByRegion(sessions, 'KALBAR').map((s) => s.id),
    ['so-kalbar-2026-11-06']
  );
});

test('resolveActiveSoRegion mengunci region untuk user non-super user', () => {
  assert.equal(
    resolveActiveSoRegion({
      requested: 'KALBAR',
      allowedRegion: 'JABODETABEK',
      isRegionLocked: true,
    }),
    'JABODETABEK'
  );
  assert.equal(
    resolveActiveSoRegion({ requested: 'KALBAR', isRegionLocked: false }),
    'KALBAR'
  );
  assert.equal(
    resolveActiveSoRegion({ requested: null, stored: 'KALBAR', isRegionLocked: false }),
    'KALBAR'
  );
  assert.equal(resolveActiveSoRegion({ isRegionLocked: false }), 'JABODETABEK');
});

test('matchesRegion dipakai untuk filter PR/SLA', () => {
  assert.equal(matchesRegion('KALBAR', 'KALBAR'), true);
  assert.equal(matchesRegion('KALBAR', 'JABODETABEK'), false);
  assert.equal(matchesRegion('JABO', 'JABODETABEK'), true);
  assert.equal(matchesRegion(null, 'ALL'), true);
  assert.equal(matchesRegion(null, 'KALBAR'), false);
});
