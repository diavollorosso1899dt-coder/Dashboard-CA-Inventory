import type { SyncSourceKey } from './types.ts';

export interface SourceDefinition {
  key: SyncSourceKey;
  label: string;
  dependsOn: SyncSourceKey[];
}

export const SOURCE_DEFINITIONS: SourceDefinition[] = [
  { key: 'asset-requests', label: 'Aset (JABO + KALBAR)', dependsOn: [] },
  { key: 'request-orders', label: 'Request Order (JABO + KALBAR)', dependsOn: [] },
  { key: 'master-catalog', label: 'Master Katalog Item', dependsOn: ['asset-requests'] },
];

const DEFINITION_BY_KEY = new Map(SOURCE_DEFINITIONS.map((d) => [d.key, d]));

export function resolveSourceOrder(requested?: string[]): {
  keys: SyncSourceKey[];
  error?: string;
} {
  const raw = requested && requested.length > 0 ? requested : SOURCE_DEFINITIONS.map((d) => d.key);
  const invalid = raw.filter((key) => !DEFINITION_BY_KEY.has(key as SyncSourceKey));
  if (invalid.length > 0) {
    return {
      keys: [],
      error: `Sumber tidak dikenal: ${invalid.join(', ')}. Pilihan: ${SOURCE_DEFINITIONS.map((d) => d.key).join(', ')}`,
    };
  }

  const requestedSet = new Set(raw as SyncSourceKey[]);
  const withDependencies = new Set<SyncSourceKey>();
  const addWithDeps = (key: SyncSourceKey) => {
    if (withDependencies.has(key)) return;
    withDependencies.add(key);
    for (const dep of DEFINITION_BY_KEY.get(key)!.dependsOn) addWithDeps(dep);
  };
  for (const key of requestedSet) addWithDeps(key);

  const ordered: SyncSourceKey[] = [];
  const visited = new Set<SyncSourceKey>();
  const visit = (key: SyncSourceKey) => {
    if (visited.has(key)) return;
    for (const dep of DEFINITION_BY_KEY.get(key)!.dependsOn) {
      if (withDependencies.has(dep)) visit(dep);
    }
    visited.add(key);
    ordered.push(key);
  };
  for (const def of SOURCE_DEFINITIONS) {
    if (withDependencies.has(def.key)) visit(def.key);
  }

  return { keys: ordered };
}