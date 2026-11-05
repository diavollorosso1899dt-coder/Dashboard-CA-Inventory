import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDebounce } from './debounce.ts';

test('webhook dalam 5 menit di-debounce', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(shouldDebounce('2026-11-05T09:56:00.000Z', now), true);
});

test('webhook setelah 5 menit dijalankan', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  assert.equal(shouldDebounce('2026-11-05T09:54:59.000Z', now), false);
});

test('belum pernah run tidak di-debounce', () => {
  assert.equal(shouldDebounce(null, new Date()), false);
});