import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRoColumns,
  isRoSheetPlaceholderRow,
  parseRoCsvLine,
} from './ro-sheet-columns.ts';

test('header Jabo normal dipetakan ke kolom yang benar', () => {
  const header =
    'No,Tanggal Input ,Tanggal Permintaan ,RO ID,Nama Item aset/perlengkapan,Jumlah,Satuan Gudang,Harga,Total,Tipe Item,Outlet,Gudang,Status,';
  const cols = detectRoColumns(header, 'JABODETABEK');

  assert.equal(cols.roIdIdx, 3);
  assert.equal(cols.itemNameIdx, 4);
  assert.equal(cols.qtyIdx, 5);
  assert.equal(cols.unitIdx, 6);
  assert.equal(cols.hargaIdx, 7);
  assert.equal(cols.totalIdx, 8);
  assert.equal(cols.tipeIdx, 9);
  assert.equal(cols.outletIdx, 10);
  assert.equal(cols.warehouseIdx, 11);
  assert.equal(cols.statusIdx, 12);
});

test('header dengan sel gabungan "Jumlah Satuan" digeser sesuai baris data', () => {
  const header =
    'No,Tanggal Input ,Tanggal Permintaan ,RO ID,Nama Item aset/perlengkapan,Jumlah Satuan,Harga,Total,Tipe Item,Outlet,Gudang,Status,';
  const sample =
    '1,06-11-2026 16:26:05,09-11-2026,104319,MUG Stainless,2,bh,3.739.008.046.758,74780.16,Perlengkapan Tetap,Mie Ayam Muntjul Pinang,Gudang GA,-,Sudah PO';
  const cols = detectRoColumns(header, 'JABODETABEK', sample);

  assert.equal(cols.qtyIdx, 5);
  assert.equal(cols.unitIdx, 6);
  assert.equal(cols.hargaIdx, 7);
  assert.equal(cols.totalIdx, 8);
  assert.equal(cols.tipeIdx, 9);
  assert.equal(cols.outletIdx, 10);
  assert.equal(cols.warehouseIdx, 11);
  assert.equal(cols.statusIdx, 12);
});

test('baris contoh/header dianggap placeholder, bukan RO', () => {
  assert.equal(isRoSheetPlaceholderRow('outlet', 'nama item'), true);
  assert.equal(isRoSheetPlaceholderRow('RO ID', 'Nama Item aset/perlengkapan'), true);
  assert.equal(isRoSheetPlaceholderRow('104319', 'MUG Stainless'), false);
});

test('parseRoCsvLine menjaga koma di dalam tanda kutip', () => {
  assert.deepEqual(parseRoCsvLine('1,"Harga, khusus",3'), ['1', 'Harga, khusus', '3']);
});