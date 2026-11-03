/**
 * Identitas pelaku perubahan untuk audit trail.
 *
 * Browser menyimpan profil user yang sedang login di cookie `ca_user`
 * (bukan untuk keamanan, hanya supaya API bisa mencatat siapa yang mengubah
 * data). Header `x-user-name` / `x-user-role` tetap diprioritaskan bila ada.
 */

export const ACTOR_COOKIE = 'ca_user';
export const ACTOR_COOKIE_MAX_AGE = 604800; // 7 hari

export interface ActorInfo {
  id?: string;
  name: string;
  role: string;
}

interface ActorSource {
  id?: string | null;
  full_name?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
}

/** Nilai cookie (sudah di-encode, aman untuk document.cookie). */
export function serializeActorCookie(user: ActorSource): string {
  const payload: ActorInfo = {
    id: user.id || undefined,
    name: user.full_name || user.name || user.username || user.email || 'User',
    role: user.role || 'User',
  };
  return encodeURIComponent(JSON.stringify(payload));
}

/** String siap dipasang ke document.cookie. */
export function buildActorCookie(user: ActorSource): string {
  return `${ACTOR_COOKIE}=${serializeActorCookie(user)}; path=/; max-age=${ACTOR_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearActorCookie(): string {
  return `${ACTOR_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

export function actorFromCookieHeader(cookieHeader?: string | null): ActorInfo | null {
  const raw = readCookie(cookieHeader, ACTOR_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      id: parsed.id || undefined,
      name: String(parsed.name || 'User'),
      role: String(parsed.role || 'User'),
    };
  } catch {
    return null;
  }
}

/**
 * Tentukan pelaku dari request. Urutan: header eksplisit, body, cookie sesi.
 */
export function resolveActor(
  req: { headers: Headers },
  bodyActor?: { name?: string | null; role?: string | null } | null
): ActorInfo {
  const headerName = req.headers.get('x-user-name');
  const headerRole = req.headers.get('x-user-role');
  if (headerName) {
    return { name: headerName, role: headerRole || 'User' };
  }

  const fromCookie = actorFromCookieHeader(req.headers.get('cookie'));
  if (bodyActor?.name) {
    return { name: bodyActor.name, role: bodyActor.role || fromCookie?.role || 'User' };
  }
  if (fromCookie) return fromCookie;

  return { name: 'System', role: 'System' };
}