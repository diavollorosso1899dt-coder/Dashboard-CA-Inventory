import test from 'node:test';
import assert from 'node:assert/strict';
import { findActiveMenuHref } from './active-menu.ts';

const items = [
  { href: '/' },
  { href: '/distribution/pr' },
  { href: '/distribution/pr/history' },
  { href: '/distribution/surat-jalan' },
  { href: '/distribution/surat-jalan/history' },
];

test('menu paling spesifik yang aktif dipilih untuk rute Riwayat PR', () => {
  assert.equal(
    findActiveMenuHref('/distribution/pr/history', items),
    '/distribution/pr/history'
  );
});

test('menu PR induk tetap aktif pada rute PR utama', () => {
  assert.equal(findActiveMenuHref('/distribution/pr', items), '/distribution/pr');
});

test('rute dengan prefix mirip tidak mengaktifkan menu PR', () => {
  assert.equal(findActiveMenuHref('/distribution/pr-lain', items), undefined);
});

test('menu beranda hanya aktif tepat di root', () => {
  assert.equal(findActiveMenuHref('/', items), '/');
});
