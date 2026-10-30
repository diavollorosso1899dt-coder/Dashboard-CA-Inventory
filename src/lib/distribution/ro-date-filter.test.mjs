import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeIsoDateOnly,
  matchesRoDateRange,
  getRoDateByField,
} from './ro-date-filter.ts';

test('normalizeIsoDateOnly menormalisasi format YYYY-MM-DD, DD/MM/YYYY, dan ISO timestamp', () => {
  assert.equal(normalizeIsoDateOnly('2026-10-30'), '2026-10-30');
  assert.equal(normalizeIsoDateOnly('30/10/2026'), '2026-10-30');
  assert.equal(normalizeIsoDateOnly('5/9/2026'), '2026-09-05');
  assert.equal(normalizeIsoDateOnly('2026-10-29T08:15:00.000Z'), '2026-10-29');
  assert.equal(normalizeIsoDateOnly('-'), null);
  assert.equal(normalizeIsoDateOnly('30/12/1899'), null);
  assert.equal(normalizeIsoDateOnly(''), null);
});

test('getRoDateByField memilih request_date untuk order_date dan target_delivery_date untuk request_date', () => {
  const sampleRo = {
    request_date: '2026-10-29',
    target_delivery_date: '2026-11-05',
  };

  assert.equal(getRoDateByField(sampleRo, 'order_date'), '2026-10-29');
  assert.equal(getRoDateByField(sampleRo, 'request_date'), '2026-11-05');
  assert.equal(
    getRoDateByField({ request_date: '2026-10-29' }, 'request_date'),
    '2026-10-29'
  );
});

test('matchesRoDateRange memfilter inklusif dari startDate sampai endDate dan menangani urutan terbalik', () => {
  assert.equal(matchesRoDateRange('2026-10-30', '', ''), true);
  assert.equal(matchesRoDateRange('2026-10-30', '2026-10-29', '2026-10-31'), true);
  assert.equal(matchesRoDateRange('2026-10-29', '2026-10-29', '2026-10-29'), true);
  assert.equal(matchesRoDateRange('2026-10-28', '2026-10-29', '2026-10-31'), false);
  assert.equal(matchesRoDateRange('2026-11-01', '2026-10-29', '2026-10-31'), false);
  assert.equal(matchesRoDateRange('2026-10-30', '2026-10-29', ''), true);
  assert.equal(matchesRoDateRange('2026-10-30', '', '2026-10-29'), false);
  // Jika startDate > endDate, otomatis swap agar tetap akurat
  assert.equal(matchesRoDateRange('2026-10-30', '2026-10-31', '2026-10-29'), true);
  assert.equal(matchesRoDateRange(null, '2026-10-29', '2026-10-31'), false);
});

