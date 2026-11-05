import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSyncRequest } from './request.ts';

test('query sources dipisah koma', () => {
  const result = parseSyncRequest({
    query: { sources: 'asset-requests,request-orders', dryRun: '1', force: 'true' },
    body: null,
    authorization: null,
  });
  assert.deepEqual(result.options.sources, ['asset-requests', 'request-orders']);
  assert.equal(result.options.dryRun, true);
  assert.equal(result.options.force, true);
  assert.equal(result.options.trigger, 'MANUAL');
});

test('trigger CRON terdeteksi dari Bearer CRON_SECRET', () => {
  process.env.CRON_SECRET = 'rahasia';
  const result = parseSyncRequest({
    query: {},
    body: null,
    authorization: 'Bearer rahasia',
  });
  assert.equal(result.options.trigger, 'CRON');
  delete process.env.CRON_SECRET;
});

test('body JSON menang atas query', () => {
  const result = parseSyncRequest({
    query: { dryRun: '0' },
    body: { sources: ['master-catalog'], dryRun: true, trigger: 'MANUAL' },
    authorization: null,
  });
  assert.deepEqual(result.options.sources, ['master-catalog']);
  assert.equal(result.options.dryRun, true);
});

test('trigger tidak dikenal kembali ke MANUAL', () => {
  const result = parseSyncRequest({
    query: {},
    body: { trigger: 'HACK' },
    authorization: null,
  });
  assert.equal(result.options.trigger, 'MANUAL');
});