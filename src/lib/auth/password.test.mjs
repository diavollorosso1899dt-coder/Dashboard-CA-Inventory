import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PASSWORD_LENGTH,
  getStoredPassword,
  passwordMatches,
  validateInitialPassword,
  validatePasswordChange,
} from './password.ts';

function input(overrides = {}) {
  return {
    currentPassword: 'password-lama',
    newPassword: 'password-baru',
    confirmPassword: 'password-baru',
    ...overrides,
  };
}

test('validatePasswordChange menolak password saat ini kosong', () => {
  const result = validatePasswordChange(input({ currentPassword: '   ' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CURRENT_REQUIRED');
});

test('validatePasswordChange menolak password baru kosong', () => {
  const result = validatePasswordChange(input({ newPassword: '', confirmPassword: '' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NEW_REQUIRED');
});

test('validatePasswordChange menolak password baru di bawah batas minimum', () => {
  const result = validatePasswordChange(
    input({ newPassword: 'a'.repeat(MIN_PASSWORD_LENGTH - 1), confirmPassword: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOO_SHORT');
});

test('validatePasswordChange menolak password baru yang sama dengan password saat ini', () => {
  const result = validatePasswordChange(
    input({ currentPassword: 'password-sama', newPassword: 'password-sama', confirmPassword: 'password-sama' })
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SAME_AS_CURRENT');
});

test('validatePasswordChange menolak konfirmasi yang tidak cocok', () => {
  const result = validatePasswordChange(input({ confirmPassword: 'password-lain' }));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONFIRM_MISMATCH');
});

test('validatePasswordChange menerima password baru yang valid', () => {
  assert.deepEqual(validatePasswordChange(input()), { ok: true });
});

test('validateInitialPassword mewajibkan minimal enam karakter', () => {
  assert.equal(validateInitialPassword('').code, 'NEW_REQUIRED');
  assert.equal(validateInitialPassword('12345').code, 'TOO_SHORT');
  assert.deepEqual(validateInitialPassword('123456'), { ok: true });
});

test('getStoredPassword memprioritaskan kolom password lalu fallback ke phone', () => {
  assert.equal(getStoredPassword({ password: 'baru', phone: 'lama' }), 'baru');
  assert.equal(getStoredPassword({ password: '', phone: 'lama' }), 'lama');
  assert.equal(getStoredPassword({}), '');
});

test('passwordMatches menolak password kosong dan hanya menerima password tersimpan', () => {
  assert.equal(passwordMatches({ password: 'rahasia' }, 'rahasia'), true);
  assert.equal(passwordMatches({ phone: 'rahasia-lama' }, 'rahasia-lama'), true);
  assert.equal(passwordMatches({ password: '', phone: '' }, ''), false);
  assert.equal(passwordMatches({}, 'admin123'), false);
  assert.equal(passwordMatches({}, 'password123'), false);
});
