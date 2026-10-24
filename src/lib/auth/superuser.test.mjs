import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPERUSER_DEFAULT_PASSWORD,
  SUPERUSER_EMAIL,
  isSuperuserIdentifier,
  isSuperuserPassword,
  resolveSuperuserPassword,
} from './superuser.ts';

test('isSuperuserIdentifier menerima alias superuser dan email resmi', () => {
  assert.equal(isSuperuserIdentifier('superuser'), true);
  assert.equal(isSuperuserIdentifier('  SUPERUSER  '), true);
  assert.equal(isSuperuserIdentifier(SUPERUSER_EMAIL), true);
  assert.equal(isSuperuserIdentifier('admin_ca1'), false);
});

test('resolveSuperuserPassword memakai default hanya bila profil belum ada', () => {
  assert.equal(resolveSuperuserPassword(null), SUPERUSER_DEFAULT_PASSWORD);
  assert.equal(resolveSuperuserPassword({ password: 'baru' }), 'baru');
  assert.equal(resolveSuperuserPassword({ phone: 'lama' }), 'lama');
  assert.equal(resolveSuperuserPassword({ password: '', phone: '' }), '');
});

test('isSuperuserPassword menolak default setelah password superuser diganti', () => {
  assert.equal(isSuperuserPassword(null, SUPERUSER_DEFAULT_PASSWORD), true);
  assert.equal(isSuperuserPassword(null, 'salah'), false);
  assert.equal(isSuperuserPassword({ password: 'baru' }, 'baru'), true);
  assert.equal(isSuperuserPassword({ password: 'baru' }, SUPERUSER_DEFAULT_PASSWORD), false);
  assert.equal(isSuperuserPassword({ password: '', phone: '' }, SUPERUSER_DEFAULT_PASSWORD), false);
});
