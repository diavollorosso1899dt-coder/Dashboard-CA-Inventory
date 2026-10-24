export const SUPERUSER_EMAIL = 'superuser@coffee-arabica.co.id';
export const SUPERUSER_DEFAULT_PASSWORD = 'usergacor';
export const SUPERUSER_FULL_NAME = 'Super User (Administrator)';
export const SUPERUSER_USERNAME = 'superuser';

interface SuperuserCredentialProfile {
  password?: string | null;
  phone?: string | null;
}

export function isSuperuserIdentifier(identifier: string): boolean {
  const normalized = (identifier || '').trim().toLowerCase();
  return normalized === SUPERUSER_USERNAME || normalized === SUPERUSER_EMAIL;
}

/**
 * Default `usergacor` hanya berlaku selama baris profil superuser belum ada.
 * Setelah superuser mengganti password, profil DB menjadi satu-satunya sumber.
 */
export function resolveSuperuserPassword(profile: SuperuserCredentialProfile | null): string {
  if (!profile) return SUPERUSER_DEFAULT_PASSWORD;
  return profile.password || profile.phone || '';
}

export function isSuperuserPassword(
  profile: SuperuserCredentialProfile | null,
  candidate: string
): boolean {
  const expected = resolveSuperuserPassword(profile);
  return expected.length > 0 && expected === (candidate || '');
}
