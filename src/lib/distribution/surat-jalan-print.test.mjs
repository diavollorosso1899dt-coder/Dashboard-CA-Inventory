import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrintUrl,
  parsePrintIds,
  selectPrintDocuments,
} from './surat-jalan-print.ts';

function makeDoc(overrides = {}) {
  return {
    id: 'sj-1',
    status: 'SHIPPED',
    items: [],
    created_at: '2026-11-11T00:00:00.000Z',
    ...overrides,
  };
}

test('parsePrintIds membaca ids yang dipisah koma, merapikan spasi, dan membuang duplikat', () => {
  assert.deepEqual(parsePrintIds(' sj-1, sj-2 ,,sj-1 '), ['sj-1', 'sj-2']);
  assert.deepEqual(parsePrintIds(['sj-1,sj-2', ' sj-3 ', 'sj-2']), [
    'sj-1',
    'sj-2',
    'sj-3',
  ]);
  assert.deepEqual(parsePrintIds(null), []);
  assert.deepEqual(parsePrintIds(''), []);
});

test('buildPrintUrl mengirim daftar ids dokumen yang dipilih secara eksplisit', () => {
  const url = buildPrintUrl('primary', 'Bakso Tyga Sapi Tanray 2', [
    { id: 'primary' },
    { id: 'sibling-1' },
    { id: null },
  ]);
  const parsed = new URL(url, 'http://localhost');

  assert.equal(
    parsed.pathname,
    '/distribution/surat-jalan/print/primary'
  );
  assert.equal(parsed.searchParams.get('outlet'), 'Bakso Tyga Sapi Tanray 2');
  assert.equal(parsed.searchParams.get('ids'), 'primary,sibling-1');
});

test('tanpa ids eksplisit, print hanya memakai dokumen utama', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'SHIPPED',
    tujuan_outlet_nama: 'Bakso Tyga Sapi Tanray 2',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'active-sibling',
      status: 'PROCESSED',
      tujuan_outlet_nama: 'Bakso Tyga Sapi Tanray 2',
    }),
    makeDoc({
      id: 'delivered-sibling',
      status: 'DELIVERED',
      tujuan_outlet_nama: 'Bakso Tyga Sapi Tanray 2',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({ primary, siblings }).map((doc) => doc.id),
    ['primary']
  );
  assert.deepEqual(
    selectPrintDocuments({ primary, siblings, explicitIds: [] }).map((doc) => doc.id),
    ['primary']
  );
});

test('ids eksplisit menggabungkan dokumen outlet yang sama tanpa menduplikasi dokumen utama', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'SHIPPED',
    tujuan_outlet_nama: 'Outlet A',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'sibling-1',
      status: 'PROCESSED',
      tujuan_outlet_nama: 'Outlet A',
    }),
    makeDoc({
      id: 'sibling-2',
      status: 'SHIPPED',
      tujuan_outlet_nama: 'Outlet A',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: ['sibling-1', 'sibling-2', 'sibling-1'],
    }).map((doc) => doc.id),
    ['primary', 'sibling-1', 'sibling-2']
  );

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: ['sibling-1'],
    }).map((doc) => doc.id),
    ['primary', 'sibling-1']
  );
});

test('dokumen aktif tidak boleh menyeret dokumen DELIVERED atau CANCELLED ke cetak ulang', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'SHIPPED',
    tujuan_outlet_nama: 'Outlet A',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'active-sibling',
      status: 'PROCESSED',
      tujuan_outlet_nama: 'Outlet A',
    }),
    makeDoc({
      id: 'delivered-sibling',
      status: 'DELIVERED',
      tujuan_outlet_nama: 'Outlet A',
    }),
    makeDoc({
      id: 'cancelled-sibling',
      status: 'CANCELLED',
      tujuan_outlet_nama: 'Outlet A',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: [
        'active-sibling',
        'delivered-sibling',
        'cancelled-sibling',
      ],
    }).map((doc) => doc.id),
    ['primary', 'active-sibling']
  );
});

test('reprint dokumen DELIVERED hanya menggabungkan dokumen DELIVERED yang dipilih', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'DELIVERED',
    tujuan_outlet_nama: 'Outlet A',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'delivered-sibling',
      status: 'DELIVERED',
      tujuan_outlet_nama: 'Outlet A',
    }),
    makeDoc({
      id: 'active-sibling',
      status: 'SHIPPED',
      tujuan_outlet_nama: 'Outlet A',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: ['delivered-sibling', 'active-sibling'],
    }).map((doc) => doc.id),
    ['primary', 'delivered-sibling']
  );
});

test('dokumen dari outlet lain tidak ikut tercetak walau id-nya dikirim eksplisit', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'SHIPPED',
    tujuan_outlet_nama: 'Outlet A',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'other-outlet',
      status: 'SHIPPED',
      tujuan_outlet_nama: 'Outlet B',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: ['other-outlet'],
    }).map((doc) => doc.id),
    ['primary']
  );
});

test('dokumen utama selalu ikut tercetak walau tidak disebut di ids', () => {
  const primary = makeDoc({
    id: 'primary',
    status: 'SHIPPED',
    tujuan_outlet_nama: 'Outlet A',
  });
  const siblings = [
    primary,
    makeDoc({
      id: 'sibling-1',
      status: 'SHIPPED',
      tujuan_outlet_nama: 'Outlet A',
    }),
  ];

  assert.deepEqual(
    selectPrintDocuments({
      primary,
      siblings,
      explicitIds: ['sibling-1'],
    }).map((doc) => doc.id),
    ['primary', 'sibling-1']
  );
});
