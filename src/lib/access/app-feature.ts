export interface FeatureRoute {
  id: string;
  href: string;
}

export type AllowedRegion = 'ALL' | 'JABODETABEK' | 'KALBAR';

const REGION_PREFIX_REGEX = /^\[REGION:(ALL|JABODETABEK|JABO|KALBAR)\]\s*/i;

/**
 * Resolve a feature by ID, exact route, or the most specific route prefix.
 * Exact matches win so child routes such as /distribution/pr/history can have
 * their own access permission without inheriting the parent PR feature.
 */
export function findFeatureByIdOrHref<T extends FeatureRoute>(
  featureIdOrHref: string,
  features: readonly T[]
): T | undefined {
  const exact = features.find(
    (feature) => feature.id === featureIdOrHref || feature.href === featureIdOrHref
  );
  if (exact) return exact;
  if (featureIdOrHref === '/') return undefined;

  return features
    .filter(
      (feature) =>
        feature.href !== '/' && featureIdOrHref.startsWith(`${feature.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function normalizeAllowedRegion(raw?: string | null): AllowedRegion {
  if (!raw) return 'ALL';
  const upper = raw.trim().toUpperCase();
  if (upper === 'JABO' || upper === 'JABODETABEK') return 'JABODETABEK';
  if (upper === 'KALBAR') return 'KALBAR';
  return 'ALL';
}

export function encodeBranchAndRegion(
  branchName?: string | null,
  allowedRegion?: string | null
): string | null {
  const cleanBranch = (branchName || '').replace(REGION_PREFIX_REGEX, '').trim();
  const region = normalizeAllowedRegion(allowedRegion);

  if (region === 'ALL') {
    return cleanBranch || null;
  }
  return cleanBranch ? `[REGION:${region}] ${cleanBranch}` : `[REGION:${region}]`;
}

export function parseBranchAndRegion(
  rawBranch?: string | null,
  explicitRegion?: string | null,
  role?: string | null
): { branchName: string; allowedRegion: AllowedRegion } {
  const isSuper = role === 'Super User' || role === 'super_user';
  const raw = (rawBranch || '').trim();
  const match = raw.match(REGION_PREFIX_REGEX);
  const cleanBranch = raw.replace(REGION_PREFIX_REGEX, '').trim();

  if (isSuper) {
    return { branchName: cleanBranch, allowedRegion: 'ALL' };
  }

  const parsedFromBranch = match ? normalizeAllowedRegion(match[1]) : 'ALL';
  const parsedExplicit = explicitRegion ? normalizeAllowedRegion(explicitRegion) : null;

  return {
    branchName: cleanBranch,
    allowedRegion: parsedExplicit ?? parsedFromBranch,
  };
}

export function resolveEffectiveRegion(
  requestedRegion?: string | null,
  userAllowedRegion?: string | null,
  isSuperUser = false
): AllowedRegion {
  if (!isSuperUser) {
    const locked = normalizeAllowedRegion(userAllowedRegion);
    if (locked === 'JABODETABEK' || locked === 'KALBAR') {
      return locked;
    }
  }
  return normalizeAllowedRegion(requestedRegion);
}

