import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSessionDate,
  pickPreviousSession,
  buildCarryForwardEntries,
  mergeOpeningStock,
} from './rollover.ts';
import { mergeDailyInventory } from './inventoryEngine.ts';

const soItem = (overrides = {}) => ({
  id: 'it-1',
  kode_barang: 'SKU-1',
  nama_barang: 'Kursi',
  kategori: 'Peralatan',
  satuan: 'UNIT',
  lokasi: 'Ruang Peralatan',
  stok_awal: 0,
  qty_penerimaan: 0,
  qty_ro: 0,
  stok_sistem: 0,
  qty_fisik: null,
  selisih: null,
  status_selisih: 'UNCHECKED',
  catatan: '',
  ...overrides,
});

test('pickPreviousSession memilih sesi terakhir sebelum tanggal SO, bukan hari yang sama', () => {
  const sessions = [
    { id: 'so-2026-10-31', tanggal: '2026-10-31' },
    { id: 'so-2026-10-30', tanggal: '2026-10-30' },
    { id: 'so-2026-10-25', tanggal: '2026-10-25' },
  ];

  assert.equal(pickPreviousSession(sessions, '2026-10-31')?.id, 'so-2026-10-30');
  assert.equal(pickPreviousSession(sessions, '2026-11-01')?.id, 'so-2026-10-31');
  assert.equal(pickPreviousSession(sessions, '2026-10-25'), null);
  assert.equal(pickPreviousSession([], '2026-10-31'), null);
});

test('pickPreviousSession tahan terhadap format tanggal ISO dan tidak peka urutan array', () => {
  const sessions = [
    { id: 'b', tanggal: '2026-10-29T10:00:00.000Z' },
    { id: 'a', tanggal: '2026-10-30T23:59:00.000Z' },
  ];

  assert.equal(pickPreviousSession(sessions, '2026-10-31T08:00:00.000Z')?.id, 'a');
  assert.equal(normalizeSessionDate('2026-10-30T23:59:00.000Z'), '2026-10-30');
  assert.equal(normalizeSessionDate(''), null);
});

test('buildCarryForwardEntries memakai qty fisik bila sudah dihitung, stok sistem bila belum', () => {
  const items = [
    soItem({ kode_barang: 'A', qty_fisik: 7, stok_sistem: 5 }),
    soItem({ kode_barang: 'B', qty_fisik: null, stok_sistem: 4 }),
    soItem({ kode_barang: '', qty_fisik: 9 }),
    soItem({ kode_barang: 'C', qty_fisik: '', stok_sistem: 2 }),
  ];

  const entries = buildCarryForwardEntries(items);

  assert.equal(entries.size, 3);
  assert.equal(entries.get('A').qty, 7);
  assert.equal(entries.get('A').counted, true);
  assert.equal(entries.get('B').qty, 4);
  assert.equal(entries.get('B').counted, false);
  assert.equal(entries.get('C').qty, 2);
  assert.equal(entries.get('C').nama_barang, 'Kursi');
  assert.equal(entries.get('C').kategori, 'Peralatan');
});

test('mergeOpeningStock memprioritaskan hasil SO sebelumnya dan master hanya mengisi SKU baru', () => {
  const master = new Map([
    ['A', 10],
    ['B', 3],
  ]);
  const masterDetails = new Map([
    ['A', { nama_barang: 'A dari master', kategori: 'Peralatan', satuan: 'UNIT', lokasi: 'Gudang' }],
  ]);
  const carryForward = new Map([
    ['A', { kode_barang: 'A', nama_barang: 'A lama', kategori: 'Peralatan', satuan: 'UNIT', lokasi: 'Rak', qty: 7, counted: true }],
    ['C', { kode_barang: 'C', nama_barang: 'C lama', kategori: 'Perlengkapan Tetap', satuan: 'PCS', lokasi: 'Kantor', qty: 2, counted: false }],
  ]);

  const merged = mergeOpeningStock({ master, masterDetails, carryForward, preferCarryForward: true });

  assert.equal(merged.stock.get('A'), 7);
  assert.equal(merged.stock.get('B'), 3);
  assert.equal(merged.stock.get('C'), 2);
  assert.equal(merged.sources.get('A'), 'SO_SEBELUMNYA');
  assert.equal(merged.sources.get('B'), 'MASTER');
  assert.equal(merged.sources.get('C'), 'SO_SEBELUMNYA');
  assert.deepEqual(merged.stats, { fromPrevious: 2, fromMaster: 1, total: 3 });

  // Detail dari master dipakai untuk SKU yang juga ada di carry-forward.
  assert.equal(merged.details.get('A').nama_barang, 'A dari master');
  assert.equal(merged.details.get('C').nama_barang, 'C lama');
  assert.equal(merged.details.get('C').kategori, 'Perlengkapan Tetap');
});

test('mergeOpeningStock mode reset memakai master penuh untuk hari pertama', () => {
  const master = new Map([['A', 10]]);
  const carryForward = new Map([
    ['A', { kode_barang: 'A', nama_barang: 'A', kategori: 'Peralatan', satuan: 'UNIT', lokasi: 'Rak', qty: 7, counted: true }],
    ['C', { kode_barang: 'C', nama_barang: 'C', kategori: 'Peralatan', satuan: 'UNIT', lokasi: 'Rak', qty: 2, counted: true }],
  ]);

  const merged = mergeOpeningStock({ master, carryForward, preferCarryForward: false });

  assert.equal(merged.stock.get('A'), 10);
  assert.equal(merged.sources.get('A'), 'MASTER');
  // SKU yang tidak ada di master tetap dibawa dari hasil SO.
  assert.equal(merged.stock.get('C'), 2);
  assert.equal(merged.sources.get('C'), 'SO_SEBELUMNYA');
  assert.deepEqual(merged.stats, { fromPrevious: 1, fromMaster: 1, total: 2 });
});

test('mergeDailyInventory menandai sumber stok awal pada setiap item', () => {
  const items = mergeDailyInventory(
    new Map([
      ['A', 7],
      ['B', 3],
    ]),
    new Map(),
    new Map(),
    new Map(),
    new Map([
      ['A', 'SO_SEBELUMNYA'],
      ['B', 'MASTER'],
    ])
  );

  const byCode = new Map(items.map((item) => [item.kode_barang, item]));
  assert.equal(byCode.get('A').stok_awal, 7);
  assert.equal(byCode.get('A').stok_awal_sumber, 'SO_SEBELUMNYA');
  assert.equal(byCode.get('B').stok_awal_sumber, 'MASTER');

  // Tanpa peta sumber, default dianggap master.
  const legacy = mergeDailyInventory(new Map([['X', 1]]));
  assert.equal(legacy[0].stok_awal_sumber, 'MASTER');
});