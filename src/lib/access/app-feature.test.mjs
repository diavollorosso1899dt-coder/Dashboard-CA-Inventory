import test from 'node:test';
import assert from 'node:assert/strict';
import { findFeatureByIdOrHref } from './app-feature.ts';
import { APP_FEATURES } from '../supabase/types.ts';

test('rute Riwayat PR memakai fitur riwayat_pr, bukan fitur PR induk', () => {
  assert.equal(
    findFeatureByIdOrHref('/distribution/pr/history', APP_FEATURES)?.id,
    'riwayat_pr'
  );
});

test('rute PR utama tetap memakai fitur purchase_pr', () => {
  assert.equal(
    findFeatureByIdOrHref('/distribution/pr', APP_FEATURES)?.id,
    'purchase_pr'
  );
});

test('prefix rute yang mirip tidak dianggap sebagai fitur PR', () => {
  assert.equal(
    findFeatureByIdOrHref('/distribution/pr-lain', APP_FEATURES),
    undefined
  );
});
