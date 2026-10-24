export const MIN_PASSWORD_LENGTH = 6;

export type PasswordValidationErrorCode =
  | 'CURRENT_REQUIRED'
  | 'NEW_REQUIRED'
  | 'TOO_SHORT'
  | 'SAME_AS_CURRENT'
  | 'CONFIRM_MISMATCH';

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; code: PasswordValidationErrorCode; message: string };

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface StoredPasswordProfile {
  password?: string | null;
  phone?: string | null;
}

const PASSWORD_MESSAGES: Record<PasswordValidationErrorCode, string> = {
  CURRENT_REQUIRED: 'Password saat ini wajib diisi.',
  NEW_REQUIRED: 'Password baru wajib diisi.',
  TOO_SHORT: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter.`,
  SAME_AS_CURRENT: 'Password baru harus berbeda dari password saat ini.',
  CONFIRM_MISMATCH: 'Konfirmasi password tidak cocok.',
};

function invalid(code: PasswordValidationErrorCode): PasswordValidationResult {
  return { ok: false, code, message: PASSWORD_MESSAGES[code] };
}

/**
 * Password baru disimpan di kolom `password`. Nilai lama di `phone` tetap
 * dipakai sebagai fallback agar akun yang dibuat sebelum migrasi tetap login.
 */
export function getStoredPassword(profile: StoredPasswordProfile): string {
  return profile.password || profile.phone || '';
}

export function passwordMatches(profile: StoredPasswordProfile, candidate: string): boolean {
  const stored = getStoredPassword(profile);
  return stored.length > 0 && stored === (candidate || '');
}

export function validateInitialPassword(password: string): PasswordValidationResult {
  const value = (password || '').trim();
  if (!value) return invalid('NEW_REQUIRED');
  if (value.length < MIN_PASSWORD_LENGTH) return invalid('TOO_SHORT');
  return { ok: true };
}

export function validatePasswordChange(input: PasswordChangeInput): PasswordValidationResult {
  const current = (input.currentPassword || '').trim();
  const next = (input.newPassword || '').trim();
  const confirm = (input.confirmPassword || '').trim();

  if (!current) return invalid('CURRENT_REQUIRED');
  if (!next) return invalid('NEW_REQUIRED');
  if (next.length < MIN_PASSWORD_LENGTH) return invalid('TOO_SHORT');
  if (next === current) return invalid('SAME_AS_CURRENT');
  if (next !== confirm) return invalid('CONFIRM_MISMATCH');

  return { ok: true };
}
