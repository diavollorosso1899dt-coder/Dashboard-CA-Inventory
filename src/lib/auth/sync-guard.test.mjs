import test from 'node:test';
import assert from 'node:assert/strict';
import { isSyncRequestAllowed } from './sync-guard.ts';

function makeRequest(options) {
  return {
    headers: {
      get: (name) => (name.toLowerCase() === 'x-sync-token' ? options.tokenHeader ?? null : null),
    },
    cookies: {
      get: (name) =>
        name === 'ca_auth' && options.cookie !== undefined ? { value: options.cookie } : undefined,
    },
    nextUrl: {
      searchParams: {
        get: (name) => (name === 'token' ? options.tokenQuery ?? null : null),
      },
    },
  };
}

test('sync ditolak tanpa cookie login dan tanpa token', () => {
  delete process.env.SYNC_TOKEN;
  assert.equal(isSyncRequestAllowed(makeRequest({})), false);
});

test('sync diizinkan untuk sesi dashboard yang login', () => {
  delete process.env.SYNC_TOKEN;
  assert.equal(isSyncRequestAllowed(makeRequest({ cookie: 'true' })), true);
});

test('sync ditolak bila cookie bukan sesi login', () => {
  delete process.env.SYNC_TOKEN;
  assert.equal(isSyncRequestAllowed(makeRequest({ cookie: 'false' })), false);
});

test('token header yang benar mengizinkan webhook', () => {
  process.env.SYNC_TOKEN = 'rahasia-123';
  assert.equal(isSyncRequestAllowed(makeRequest({ tokenHeader: 'rahasia-123' })), true);
  delete process.env.SYNC_TOKEN;
});

test('token query yang benar mengizinkan webhook', () => {
  process.env.SYNC_TOKEN = 'rahasia-123';
  assert.equal(isSyncRequestAllowed(makeRequest({ tokenQuery: 'rahasia-123' })), true);
  delete process.env.SYNC_TOKEN;
});

test('token salah tetap ditolak walau SYNC_TOKEN diset', () => {
  process.env.SYNC_TOKEN = 'rahasia-123';
  assert.equal(isSyncRequestAllowed(makeRequest({ tokenHeader: 'salah' })), false);
  delete process.env.SYNC_TOKEN;
});