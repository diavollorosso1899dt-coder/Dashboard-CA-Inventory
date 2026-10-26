import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBranchOpeningSummaries } from './branch-summaries.ts';

const daysByDate = (date) => {
  if (date === '2026-03-04') return -5;
  if (date === '2026-03-20') return 10;
  return null;
};

const asset = (overrides) => ({
  branch_name: 'Cipondoh',
  region: 'JABODETABEK',
  opening_date: '2026-03-04',
  quantity_needed: 1,
  quantity_stock_allocated: 0,
  item_delivery_status: 'On Proses',
  realized_price: 0,
  deal_price: 0,
  rab_total: 0,
  ...overrides,
});

test('menghitung selesai, sebagian, belum, dan mengecualikan Ready Antar', () => {
  const items = [
    asset({ opening_date: null, quantity_needed: 10, quantity_stock_allocated: 10, deal_price: 100, realized_price: 110, rab_total: 120 }),
    asset({ opening_date: null, quantity_needed: 5, item_delivery_status: 'Terima Outlet', deal_price: 50, rab_total: 60 }),
    asset({ opening_date: '2026-03-04', quantity_needed: 4, item_delivery_status: 'Ready Antar', deal_price: 40, rab_total: 48 }),
    asset({ quantity_needed: 2, quantity_stock_allocated: 1, item_delivery_status: 'Diterima Sebagian', deal_price: 20, rab_total: 24 }),
    asset({ quantity_needed: 3, item_delivery_status: 'On Proses', deal_price: 30, rab_total: 36 }),
    asset({
      branch_name: 'Bandung',
      opening_date: '2026-03-20',
      quantity_needed: 10,
      item_delivery_status: 'Ready Gudang SCGA',
      deal_price: 100,
      rab_total: 120,
    }),
    asset({ branch_name: '', opening_date: '2026-03-25', quantity_needed: 99 }),
    asset({ branch_name: 'TBA', opening_date: null, quantity_needed: 1, item_delivery_status: 'On Proses' }),
  ];

  const summaries = buildBranchOpeningSummaries(items, daysByDate);

  assert.equal(summaries.length, 3);

  const [cipondoh, bandung, tba] = summaries;
  assert.equal(cipondoh.branch_name, 'Cipondoh');
  assert.equal(cipondoh.region, 'JABODETABEK');
  assert.equal(cipondoh.target_opening_date, '2026-03-04');
  assert.equal(cipondoh.total_items_needed, 5);
  assert.equal(cipondoh.items_completed, 2);
  assert.equal(cipondoh.items_partial, 1);
  assert.equal(cipondoh.items_pending, 2);
  assert.equal(cipondoh.readiness_percentage, 40);
  assert.equal(cipondoh.days_until_opening, -5);
  assert.equal(cipondoh.urgency_status, 'PAST_DUE');
  assert.equal(cipondoh.is_critical_h3, true);
  assert.equal(cipondoh.total_deal_cost, 250);
  assert.equal(cipondoh.total_rab_budget, 288);

  assert.equal(bandung.branch_name, 'Bandung');
  assert.equal(bandung.items_completed, 1);
  assert.equal(bandung.items_pending, 0);
  assert.equal(bandung.readiness_percentage, 100);
  assert.equal(bandung.days_until_opening, 10);
  assert.equal(bandung.urgency_status, 'COMPLETED');
  assert.equal(bandung.is_critical_h3, false);

  assert.equal(tba.branch_name, 'TBA');
  assert.equal(tba.days_until_opening, null);
  assert.equal(tba.urgency_status, 'UPCOMING');
  assert.equal(tba.is_critical_h3, false);
});

test('menggabungkan nama cabang tanpa membedakan huruf besar/kecil dan spasi', () => {
  const summaries = buildBranchOpeningSummaries(
    [
      asset({ branch_name: ' Cipondoh ', quantity_needed: 1, quantity_stock_allocated: 1 }),
      asset({ branch_name: 'cipondoh', quantity_needed: 1, item_delivery_status: 'Terima Outlet' }),
    ],
    daysByDate
  );

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].total_items_needed, 2);
  assert.equal(summaries[0].items_completed, 2);
  assert.equal(summaries[0].branch_name, 'Cipondoh');
});

test('mengembalikan array kosong bila tidak ada item', () => {
  assert.deepEqual(buildBranchOpeningSummaries([], daysByDate), []);
});
