import type { RegionHealthMap } from './types.ts';

export type StaleScope = 'ALL' | 'JABODETABEK' | 'KALBAR' | 'NONE';

export function staleRegionScope(regions: RegionHealthMap): StaleScope {
  const jabo = regions.JABODETABEK?.ok === true;
  const kalbar = regions.KALBAR?.ok === true;
  if (!jabo && !kalbar) return 'NONE';
  if (jabo && kalbar) return 'ALL';
  return jabo ? 'JABODETABEK' : 'KALBAR';
}