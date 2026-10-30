import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBranchAndRegion,
  findFeatureByIdOrHref,
  matchesLoginIdentifier,
  parseBranchAndRegion,
  resolveEffectiveRegion,
} from './app-feature.ts';
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

test('encodeBranchAndRegion dan parseBranchAndRegion menyimpan dan membaca pemisah region dengan benar', () => {
  const encodedJaboOnly = encodeBranchAndRegion('', 'JABODETABEK');
  assert.equal(encodedJaboOnly, '[REGION:JABODETABEK]');

  const parsedJaboOnly = parseBranchAndRegion(encodedJaboOnly, undefined, 'Admin');
  assert.equal(parsedJaboOnly.branchName, '');
  assert.equal(parsedJaboOnly.allowedRegion, 'JABODETABEK');

  const encodedWithOutlet = encodeBranchAndRegion('Sop Mak Garang Singkawang', 'KALBAR');
  assert.equal(encodedWithOutlet, '[REGION:KALBAR] Sop Mak Garang Singkawang');

  const parsedWithOutlet = parseBranchAndRegion(encodedWithOutlet, undefined, 'User Outlet Manager');
  assert.equal(parsedWithOutlet.branchName, 'Sop Mak Garang Singkawang');
  assert.equal(parsedWithOutlet.allowedRegion, 'KALBAR');
});

test('Super User selalu mendapat akses region ALL', () => {
  const parsedSuper = parseBranchAndRegion('[REGION:JABODETABEK]', 'JABODETABEK', 'Super User');
  assert.equal(parsedSuper.allowedRegion, 'ALL');
  assert.equal(resolveEffectiveRegion('KALBAR', 'JABODETABEK', true), 'KALBAR');
});

test('resolveEffectiveRegion mengunci region untuk pengguna dengan pembatasan JABODETABEK atau KALBAR', () => {
  assert.equal(resolveEffectiveRegion('ALL', 'JABODETABEK', false), 'JABODETABEK');
  assert.equal(resolveEffectiveRegion('KALBAR', 'JABODETABEK', false), 'JABODETABEK');
  assert.equal(resolveEffectiveRegion('JABODETABEK', 'KALBAR', false), 'KALBAR');
  assert.equal(resolveEffectiveRegion('KALBAR', 'ALL', false), 'KALBAR');
});

test('encodeBranchAndRegion dan parseBranchAndRegion menyimpan serta memulihkan allowed_features di branch_name', () => {
  const encoded = encodeBranchAndRegion('Cabang Pontianak', 'KALBAR', [
    'dashboard',
    'purchase_pr',
    'riwayat_pr',
  ]);
  assert.equal(
    encoded,
    '[REGION:KALBAR][FEATURES:dashboard,purchase_pr,riwayat_pr] Cabang Pontianak'
  );

  const parsed = parseBranchAndRegion(encoded, undefined, 'Admin');
  assert.equal(parsed.branchName, 'Cabang Pontianak');
  assert.equal(parsed.allowedRegion, 'KALBAR');
  assert.deepEqual(parsed.allowedFeatures, ['dashboard', 'purchase_pr', 'riwayat_pr']);

  // Juga bekerja ketika region ALL tapi fitur dibatasi
  const encodedAllRegionRestrictedFeatures = encodeBranchAndRegion('', 'ALL', ['kelola_ro']);
  assert.equal(encodedAllRegionRestrictedFeatures, '[FEATURES:kelola_ro]');
  const parsedRestricted = parseBranchAndRegion(encodedAllRegionRestrictedFeatures, undefined, 'User');
  assert.equal(parsedRestricted.branchName, '');
  assert.equal(parsedRestricted.allowedRegion, 'ALL');
  assert.deepEqual(parsedRestricted.allowedFeatures, ['kelola_ro']);
});

test('matchesLoginIdentifier mengenali username, email, prefix email, dan nama lengkap tanpa spasi', () => {
  const profile = {
    username: 'admin_kalbar',
    email: 'admin_kalbar',
    full_name: 'Nurul',
  };
  assert.equal(matchesLoginIdentifier(profile, 'admin_kalbar'), true);
  assert.equal(matchesLoginIdentifier(profile, 'ADMIN_KALBAR'), true);
  assert.equal(matchesLoginIdentifier(profile, 'nurul'), true);
  assert.equal(matchesLoginIdentifier(profile, 'Nurul'), true);
  assert.equal(matchesLoginIdentifier(profile, 'budi'), false);
});


