import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDistributionQueueKeys,
  resolveReceivedQuantity,
} from './received-qty.ts';

test('resolveReceivedQuantity mengutamakan nilai dari ca_received_qty_map Pemantauan Distribusi', () => {
  const keys = buildDistributionQueueKeys({
    roId: 'ro-123',
    roNumber: 'RO-80822',
    branchName: 'Sop Mak Garang Singkawang',
    itemId: 'roi-1',
    itemName: 'saringan kuah',
  });

  const received = resolveReceivedQuantity({
    orderedQty: 4,
    stockSource: 'GUDANG_SCGA',
    receivedQtyMap: {
      'ro-ro-123-roi-1': 3,
    },
    candidateKeys: keys,
  });

  assert.equal(received, 3);
});

test('resolveReceivedQuantity memakai received_quantity dari dokumen transfer Pemantauan Distribusi bila ada', () => {
  const received = resolveReceivedQuantity({
    orderedQty: 4,
    stockSource: 'GUDANG_SCGA',
    transferReceivedQty: 2,
    transferQty: 4,
    isTransferredAndReceived: true,
    receivedQtyMap: {},
    candidateKeys: [],
  });

  assert.equal(received, 2);
});

test('resolveReceivedQuantity memakai default jumlah order untuk item Ready Stock di Pemantauan Distribusi', () => {
  const received = resolveReceivedQuantity({
    orderedQty: 4,
    itemFulfilledQty: 0,
    stockSource: 'GUDANG_SCGA',
    receivedQtyMap: {},
    candidateKeys: [],
  });

  assert.equal(received, 4);
});

test('resolveReceivedQuantity mengembalikan 0 untuk item yang belum diproses dan belum diterima', () => {
  const received = resolveReceivedQuantity({
    orderedQty: 4,
    itemFulfilledQty: 0,
    stockSource: 'ON_PROSES',
    isTransferredAndReceived: false,
    receivedQtyMap: {},
    candidateKeys: [],
  });

  assert.equal(received, 0);
});
