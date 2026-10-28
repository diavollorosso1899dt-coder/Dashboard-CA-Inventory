export interface FeatureRoute {
  id: string;
  href: string;
}

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
