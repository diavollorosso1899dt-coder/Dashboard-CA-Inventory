/**
 * Region helpers untuk SO Harian.
 * Satu sesi SO selalu milik satu region: JABODETABEK atau KALBAR.
 */

export type SoRegion = 'JABODETABEK' | 'KALBAR';

export const SO_REGIONS: SoRegion[] = ['JABODETABEK', 'KALBAR'];

export const SO_ACTIVE_REGION_KEY = 'so_active_region';

export function normalizeSoRegion(value?: string | null): SoRegion | null {
  if (!value) return null;
  const upper = String(value).trim().toUpperCase();
  if (upper === 'JABO' || upper === 'JABODETABEK') return 'JABODETABEK';
  if (upper === 'KALBAR' || upper === 'KALIMANTAN BARAT') return 'KALBAR';
  return null;
}

export function soRegionSlug(region: SoRegion): 'jabodetabek' | 'kalbar' {
  return region === 'KALBAR' ? 'kalbar' : 'jabodetabek';
}

export function buildSoSessionId(region: SoRegion, date: string): string {
  const normalizedDate =
    String(date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `so-${soRegionSlug(region)}-${normalizedDate}`;
}

export interface ParsedSoSessionId {
  region: SoRegion | null;
  date: string | null;
  legacy: boolean;
}

export function parseSoSessionId(id?: string | null): ParsedSoSessionId {
  const value = String(id || '').trim();

  const regional = /^so-(jabodetabek|kalbar)-(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (regional) {
    return {
      region: regional[1] === 'kalbar' ? 'KALBAR' : 'JABODETABEK',
      date: regional[2],
      legacy: false,
    };
  }

  const legacy = /^so-(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (legacy) {
    return { region: null, date: legacy[1], legacy: true };
  }

  return { region: null, date: null, legacy: false };
}

export function resolveSessionRegion(session: {
  region?: string | null;
  id?: string | null;
}): SoRegion | null {
  return normalizeSoRegion(session?.region) || parseSoSessionId(session?.id).region;
}

export function filterSessionsByRegion<
  T extends { region?: string | null; id?: string | null }
>(sessions: T[] = [], region: SoRegion): T[] {
  return (sessions || []).filter((session) => resolveSessionRegion(session) === region);
}

export function resolveActiveSoRegion(options: {
  requested?: string | null;
  allowedRegion?: string | null;
  isRegionLocked?: boolean;
  stored?: string | null;
}): SoRegion {
  if (options.isRegionLocked) {
    return normalizeSoRegion(options.allowedRegion) || 'JABODETABEK';
  }
  return (
    normalizeSoRegion(options.requested) ||
    normalizeSoRegion(options.stored) ||
    'JABODETABEK'
  );
}
