import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectGroupConfirmationTargets,
  normalizeConfirmedSjItems,
  applyConfirmedItemsToRequestOrders,
} from './confirm-surat-jalan.ts';

test('collectGroupConfirmationTargets mengumpulkan seluruh dokumen dan item dalam 1 grup Surat Jalan', () => {
  const group = {
    key: 'outlet-a',
    outletName: 'Warung Nini Karawang',
    sjNumbers: ['SJ-001', 'SJ-002'],
    roNumbers: ['RO-101', 'RO-102'],
    totalUnits: 5,
    primarySj: { id: 'sj-1', nomor_sj: 'SJ-001', ro_nomor: 'RO-101' },
    docs: [
      {
        id: 'sj-1',
        nomor_sj: 'SJ-001',
        ro_nomor: 'RO-101',
        tujuan_outlet_nama: 'Warung Nini Karawang',
        items: [{ id: 'it-1', item_name: 'Kompor', quantity: 2 }],
      },
      {
        id: 'sj-2',
        nomor_sj: 'SJ-002',
        ro_nomor: 'RO-102',
        tujuan_outlet_nama: 'Warung Nini Karawang',
        items: [{ id: 'it-2', item_name: 'Panci', quantity: 3 }],
      },
    ],
    items: [
      { id: 'it-1', item_name: 'Kompor', quantity: 2 },
      { id: 'it-2', item_name: 'Panci', quantity: 3 },
    ],
  };

  const result = collectGroupConfirmationTargets(group);
  assert.deepEqual(result.docIds, ['sj-1', 'sj-2']);
  assert.deepEqual(result.roNumbers, ['RO-101', 'RO-102']);
  assert.equal(result.items.length, 2);
  assert.equal(result.outletName, 'Warung Nini Karawang');
});

test('normalizeConfirmedSjItems mengisi received_quantity untuk seluruh item sekaligus', () => {
  const items = [
    { id: '1', item_name: 'Meja', quantity: 4 },
    { id: '2', nama_barang: 'Kursi', qty: 8, received_quantity: 7 },
  ];

  const normalized = normalizeConfirmedSjItems(items);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].received_quantity, 4);
  assert.equal(normalized[0].received_qty, 4);
  assert.equal(normalized[1].received_quantity, 7);
  assert.equal(normalized[1].received_qty, 7);
});

test('applyConfirmedItemsToRequestOrders menyelesaikan seluruh item pada RO yang sama sekaligus tanpa saling menimpa', () => {
  const requestOrders = [
    {
      id: 'ro-uuid-1',
      ro_number: 'RO-102429',
      branch_name: 'Warung Nini Karawang',
      status: 'APPROVED',
      current_stage: 'SURAT_JALAN',
      items: [
        { id: 'ri-1', item_name: 'Rak Sudut Besi L', quantity_ordered: 3, quantity_fulfilled: 0, stock_source: 'GUDANG_SCGA' },
        { id: 'ri-2', item_name: 'Sikat Lantai', quantity_ordered: 2, quantity_fulfilled: 0, stock_source: 'GUDANG_SCGA' },
        { id: 'ri-3', item_name: 'Sapu Lidi Gagang', quantity_ordered: 2, quantity_fulfilled: 0, stock_source: 'GUDANG_SCGA' },
      ],
    },
  ];

  const confirmedItems = [
    { id: 'ti-1', asset_id: 'ro-ro-uuid-1-ri-1', item_name: 'Rak Sudut Besi L', quantity: 3, received_quantity: 3 },
    { id: 'ti-2', asset_id: 'ro-ro-uuid-1-ri-2', item_name: 'Sikat Lantai', quantity: 2, received_quantity: 2 },
    { id: 'ti-3', asset_id: 'ro-ro-uuid-1-ri-3', item_name: 'Sapu Lidi Gagang', quantity: 2, received_quantity: 2 },
  ];

  const updates = applyConfirmedItemsToRequestOrders(
    requestOrders,
    confirmedItems,
    'Warung Nini Karawang',
    {
      receivedDate: '2026-10-30',
      receiverName: 'Budi PIC',
      notes: 'Lengkap semua item',
      roNumbers: ['RO-102429'],
    }
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'ro-uuid-1');
  assert.equal(updates[0].updates.status, 'COMPLETED');
  assert.equal(updates[0].updates.current_stage, 'SELESAI');
  assert.deepEqual(
    updates[0].updates.items.map((i) => i.quantity_fulfilled),
    [3, 2, 2]
  );
});

test('fallback per outlet hanya menutup satu item RO walau nama item sama di RO lain', () => {
  const makeRo = (id, order) => ({
    id,
    ro_number: `RO-${id}`,
    branch_name: 'Outlet Sama',
    status: 'APPROVED',
    current_stage: 'SURAT_JALAN',
    items: [
      { id: `${id}-item`, item_name: 'Kursi Lipat', quantity_ordered: order, quantity_fulfilled: 0, stock_source: 'GUDANG_SCGA' },
    ],
  });

  const updates = applyConfirmedItemsToRequestOrders(
    [makeRo('1', 4), makeRo('2', 4)],
    [{ id: 'ti-1', item_name: 'Kursi Lipat', quantity: 4, received_quantity: 4 }],
    'Outlet Sama',
    { receivedDate: '2026-10-30', receiverName: 'PIC', roNumbers: [] }
  );

  // Hanya RO pertama yang boleh terpenuhi, RO kedua tidak ikut dianggap diterima.
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, '1');
  assert.equal(updates[0].updates.items[0].quantity_fulfilled, 4);
});

test('fallback per outlet mengakumulasi kuantitas dan tidak menurunkan tahap yang sudah maju', () => {
  const requestOrders = [
    {
      id: 'ro-1',
      ro_number: 'RO-1',
      branch_name: 'Outlet Sama',
      status: 'APPROVED',
      current_stage: 'CHECKLIST',
      items: [
        { id: 'i-1', item_name: 'Rak Besi', quantity_ordered: 5, quantity_fulfilled: 1, received_qty: 1, stock_source: 'GUDANG_SCGA' },
      ],
    },
  ];

  const updates = applyConfirmedItemsToRequestOrders(
    requestOrders,
    [{ id: 'ti-1', item_name: 'Rak Besi', quantity: 2, received_quantity: 2 }],
    'Outlet Sama',
    { receivedDate: '2026-10-30', receiverName: 'PIC' }
  );

  assert.equal(updates[0].updates.items[0].quantity_fulfilled, 3);
  assert.equal(updates[0].updates.current_stage, 'CHECKLIST');
  assert.equal(updates[0].updates.status, 'CHECKLIST_DONE');

  // Konfirmasi dokumen yang sama diulang tidak boleh menambah kuantitas lagi.
  const again = applyConfirmedItemsToRequestOrders(
    requestOrders,
    [{ id: 'ti-1', item_name: 'Rak Besi', quantity: 2, received_quantity: 2 }],
    'Outlet Sama',
    { receivedDate: '2026-10-30', receiverName: 'PIC' }
  );
  assert.equal(again[0].updates.items[0].quantity_fulfilled, 3);
  assert.deepEqual(again[0].updates.items[0].received_from, ['ti-1']);
});

test('RO eksplisit tidak menutup item PR_VENDOR yang belum dikirim', () => {
  const requestOrders = [
    {
      id: 'ro-2',
      ro_number: 'RO-2',
      branch_name: 'Outlet Sama',
      status: 'APPROVED',
      current_stage: 'SURAT_JALAN',
      items: [
        { id: 'i-a', item_name: 'Meja', quantity_ordered: 2, quantity_fulfilled: 0, stock_source: 'GUDANG_SCGA' },
        { id: 'i-b', item_name: 'Lemari', quantity_ordered: 3, quantity_fulfilled: 0, stock_source: 'PR_VENDOR' },
      ],
    },
  ];

  const updates = applyConfirmedItemsToRequestOrders(
    requestOrders,
    [{ id: 'ti-a', asset_id: 'ro-ro-2-i-a', item_name: 'Meja', quantity: 2, received_quantity: 2 }],
    'Outlet Sama',
    { receivedDate: '2026-10-30', receiverName: 'PIC', roNumbers: ['RO-2'] }
  );

  const items = updates[0].updates.items;
  assert.equal(items[0].quantity_fulfilled, 2);
  assert.equal(items[1].quantity_fulfilled, 0);
  assert.equal(items[1].stock_source, 'PR_VENDOR');
  assert.equal(updates[0].updates.status, 'CHECKLIST_DONE');
  assert.equal(updates[0].updates.current_stage, 'ASET_SAMPAI');
});

