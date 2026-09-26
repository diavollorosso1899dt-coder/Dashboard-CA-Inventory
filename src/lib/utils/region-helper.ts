/**
 * Region Helper utilities for Area filtering across Dashboard CA & Inventory
 * Supports 'ALL', 'JABODETABEK' (or 'JABO'), and 'KALBAR'
 */

export type StandardRegion = 'ALL' | 'JABODETABEK' | 'KALBAR';

/**
 * Normalizes any region string representation to standard form: 'ALL', 'JABODETABEK', or 'KALBAR'
 */
export function normalizeRegion(r?: string | null): StandardRegion {
  if (!r) return 'ALL';
  const upper = r.trim().toUpperCase();
  if (upper === 'JABO' || upper === 'JABODETABEK') return 'JABODETABEK';
  if (upper === 'KALBAR' || upper === 'KALIMANTAN BARAT') return 'KALBAR';
  if (upper === 'ALL' || upper === 'SEMUA') return 'ALL';
  return 'ALL';
}

/**
 * Determines whether an entity's region matches the filter region.
 * If targetFilter is 'ALL', matches everything.
 */
export function matchesRegion(
  entityRegion?: string | null,
  targetFilter?: string | null
): boolean {
  const filterNorm = normalizeRegion(targetFilter);
  if (filterNorm === 'ALL') return true;

  const entityNorm = normalizeRegion(entityRegion);
  return entityNorm === filterNorm;
}

/**
 * Formats region for UI display badge/label
 */
export function getRegionBadgeLabel(r?: string | null): string {
  const norm = normalizeRegion(r);
  if (norm === 'JABODETABEK') return 'JABO';
  if (norm === 'KALBAR') return 'KALBAR';
  return 'Semua Area';
}
