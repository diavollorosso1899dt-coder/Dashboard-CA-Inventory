export interface FeatureRoute {
  id: string;
  href: string;
}

export type AllowedRegion = 'ALL' | 'JABODETABEK' | 'KALBAR';

const REGION_TAG_REGEX = /\[REGION:(ALL|JABODETABEK|JABO|KALBAR)\]/i;
const FEATURES_TAG_REGEX = /\[FEATURES:([^\]]*)\]/i;
const LEADING_TAGS_REGEX = /^(?:\s*\[(?:REGION|FEATURES):[^\]]*\]\s*)+/i;

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
  allowedRegion?: string | null,
  allowedFeatures?: string[] | null
): string | null {
  const cleanBranch = (branchName || '').replace(LEADING_TAGS_REGEX, '').trim();
  const region = normalizeAllowedRegion(allowedRegion);

  let prefix = '';
  if (region !== 'ALL') {
    prefix += `[REGION:${region}]`;
  }
  if (Array.isArray(allowedFeatures)) {
    const cleanFeatures = allowedFeatures
      .map((f) => String(f || '').trim())
      .filter(Boolean);
    prefix += `[FEATURES:${cleanFeatures.join(',')}]`;
  }

  if (!prefix) {
    return cleanBranch || null;
  }
  return cleanBranch ? `${prefix} ${cleanBranch}` : prefix;
}

export function parseBranchAndRegion(
  rawBranch?: string | null,
  explicitRegion?: string | null,
  role?: string | null,
  explicitFeatures?: string[] | null
): { branchName: string; allowedRegion: AllowedRegion; allowedFeatures?: string[] } {
  const isSuper = role === 'Super User' || role === 'super_user';
  const raw = (rawBranch || '').trim();
  const regionMatch = raw.match(REGION_TAG_REGEX);
  const featuresMatch = raw.match(FEATURES_TAG_REGEX);
  const cleanBranch = raw.replace(LEADING_TAGS_REGEX, '').trim();

  if (isSuper) {
    return { branchName: cleanBranch, allowedRegion: 'ALL', allowedFeatures: undefined };
  }

  const parsedFromBranch = regionMatch ? normalizeAllowedRegion(regionMatch[1]) : 'ALL';
  const parsedExplicit = explicitRegion ? normalizeAllowedRegion(explicitRegion) : null;

  let parsedFeatures: string[] | undefined = undefined;
  if (Array.isArray(explicitFeatures)) {
    parsedFeatures = explicitFeatures;
  } else if (featuresMatch) {
    const rawList = featuresMatch[1].trim();
    parsedFeatures = rawList
      ? rawList
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }

  return {
    branchName: cleanBranch,
    allowedRegion: parsedExplicit ?? parsedFromBranch,
    allowedFeatures: parsedFeatures,
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

export function matchesLoginIdentifier(
  profile: {
    username?: string | null;
    email?: string | null;
    full_name?: string | null;
  },
  rawLoginId: string
): boolean {
  const cleanInput = (rawLoginId || '').trim().toLowerCase().replace(/^@/, '');
  if (!cleanInput) return false;
  const compactInput = cleanInput.replace(/\s+/g, '');

  const uName = (profile.username || '').trim().toLowerCase().replace(/^@/, '');
  const uEmail = (profile.email || '').trim().toLowerCase().replace(/^@/, '');
  const emailPrefix = uEmail.includes('@') ? uEmail.split('@')[0] : uEmail;
  const fullName = (profile.full_name || '').trim().toLowerCase();
  const compactFullName = fullName.replace(/\s+/g, '');

  return (
    uName === cleanInput ||
    uName === compactInput ||
    uEmail === cleanInput ||
    uEmail === compactInput ||
    (Boolean(emailPrefix) && emailPrefix === cleanInput) ||
    fullName === cleanInput ||
    (Boolean(compactFullName) && compactFullName === compactInput)
  );
}
