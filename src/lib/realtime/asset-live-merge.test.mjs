import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAssetChange,
  mergeAssetRows,
  removeAssetRow,
} from './asset-live-merge.ts';

const row = (id, status, updated_at, region = 'JABODETABEK') => ({
  id,
  region,
  item_delivery_status: status,
  updated_at,
});

const always = () => true;

test('mergeAssetRows menambahkan baris baru dan memperbarui baris lama berdasarkan id', () => {
  const current = [
    row('a', 'lama', '2026-01-01T00:00:00.000Z'),
    row('b', 'tetap', '2026-01-01T00:00:00.000Z'),
  ];

  const result = mergeAssetRows(
    current,
    [
      row('a', 'baru', '2026-01-02T00:00:00.000Z'),
      row('c', 'baru-baru', '2026-01-02T00:00:00.000Z'),
    ],
    always
  );

  assert.deepEqual(result.map((item) => item.id), ['c', 'a', 'b']);
  assert.equal(result.find((item) => item.id === 'a').item_delivery_status, 'baru');
  assert.equal(result.find((item) => item.id === 'b').item_delivery_status, 'tetap');
  assert.equal(result.find((item) => item.id === 'c').item_delivery_status, 'baru-baru');
});

test('mergeAssetRows mempertahankan data lokal bila updated_at masuk lebih lama', () => {
  const current = [row('a', 'terbaru', '2026-01-02T00:00:00.000Z')];

  const result = mergeAssetRows(
    current,
    [row('a', 'basi', '2026-01-01T00:00:00.000Z')],
    always
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].item_delivery_status, 'terbaru');
});

test('mergeAssetRows memakai data masuk bila updated_at sama', () => {
  const current = [row('a', 'lama', '2026-01-02T00:00:00.000Z')];

  const result = mergeAssetRows(
    current,
    [row('a', 'baru', '2026-01-02T00:00:00.000Z')],
    always
  );

  assert.equal(result[0].item_delivery_status, 'baru');
});

test('mergeAssetRows membuang baris yang pindah keluar region dan tidak menambah baris region lain', () => {
  const current = [
    row('a', 'jabo', '2026-01-01T00:00:00.000Z', 'JABODETABEK'),
    row('b', 'tetap', '2026-01-01T00:00:00.000Z', 'JABODETABEK'),
  ];

  const result = mergeAssetRows(
    current,
    [
      row('a', 'pindah', '2026-01-02T00:00:00.000Z', 'KALBAR'),
      row('c', 'baru', '2026-01-02T00:00:00.000Z', 'JABODETABEK'),
      row('d', 'luar', '2026-01-02T00:00:00.000Z', 'KALBAR'),
    ],
    (item) => item.region === 'JABODETABEK'
  );

  assert.deepEqual(result.map((item) => item.id), ['c', 'b']);
  assert.equal(result[0].item_delivery_status, 'baru');
  assert.equal(result[1].item_delivery_status, 'tetap');
});

test('mergeAssetRows mengembalikan array yang sama bila event tidak relevan dengan region', () => {
  const current = [row('a', 'tetap', '2026-01-01T00:00:00.000Z', 'JABODETABEK')];

  const result = mergeAssetRows(
    current,
    [row('x', 'luar', '2026-01-02T00:00:00.000Z', 'KALBAR')],
    (item) => item.region === 'JABODETABEK'
  );

  assert.equal(result, current);
});

test('applyAssetChange menangani update dan delete', () => {
  const current = [
    row('a', 'lama', '2026-01-01T00:00:00.000Z'),
    row('b', 'tetap', '2026-01-01T00:00:00.000Z'),
  ];

  const updated = applyAssetChange(
    current,
    { type: 'UPSERT', row: row('a', 'baru', '2026-01-02T00:00:00.000Z') },
    always
  );
  assert.equal(updated.find((item) => item.id === 'a').item_delivery_status, 'baru');

  const deleted = applyAssetChange(updated, { type: 'DELETE', id: 'a' }, always);
  assert.deepEqual(deleted.map((item) => item.id), ['b']);
});

test('removeAssetRow mengembalikan array yang sama bila id tidak ada', () => {
  const current = [row('a', 'tetap', '2026-01-01T00:00:00.000Z')];
  assert.equal(removeAssetRow(current, 'tidak-ada'), current);
});
