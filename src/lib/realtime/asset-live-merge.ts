import type { AssetRequest } from '../supabase/types';

export type AssetLiveChange =
  | { type: 'UPSERT'; row: AssetRequest }
  | { type: 'DELETE'; id: string };

export type ShouldContainAsset = (row: AssetRequest) => boolean;

const alwaysContain: ShouldContainAsset = () => true;

function updatedAtMs(row: AssetRequest): number {
  const value = Date.parse(row.updated_at || '');
  return Number.isNaN(value) ? 0 : value;
}

export function isNewerOrEqual(incoming: AssetRequest, existing: AssetRequest): boolean {
  return updatedAtMs(incoming) >= updatedAtMs(existing);
}

function assetId(row: AssetRequest): string {
  return row.id || row.external_id;
}

/**
 * Merges realtime rows into a local asset list.
 *
 * `shouldContain` is used for the active region: rows that no longer belong to
 * it are removed, and rows from other regions are ignored. `updated_at` is the
 * tie-breaker so an in-flight catch-up query cannot overwrite a newer event.
 */
export function mergeAssetRows(
  current: AssetRequest[],
  incoming: AssetRequest[],
  shouldContain: ShouldContainAsset = alwaysContain
): AssetRequest[] {
  if (incoming.length === 0) return current;

  const incomingById = new Map<string, AssetRequest>();
  for (const row of incoming) {
    const id = assetId(row);
    if (!id) continue;
    const queued = incomingById.get(id);
    if (!queued || isNewerOrEqual(row, queued)) {
      incomingById.set(id, row);
    }
  }

  if (incomingById.size === 0) return current;

  const currentIds = new Set<string>();
  const next: AssetRequest[] = [];
  let changed = false;

  for (const item of current) {
    const id = assetId(item);
    currentIds.add(id);
    const replacement = incomingById.get(id);

    if (replacement) {
      if (shouldContain(replacement)) {
        if (isNewerOrEqual(replacement, item)) {
          next.push(replacement);
          changed = true;
        } else {
          next.push(item);
        }
      } else {
        changed = true;
      }
      continue;
    }

    if (shouldContain(item)) {
      next.push(item);
    } else {
      changed = true;
    }
  }

  const newRows: AssetRequest[] = [];
  for (const [id, row] of incomingById) {
    if (!currentIds.has(id) && shouldContain(row)) {
      newRows.push(row);
    }
  }

  if (newRows.length > 0) {
    return [...newRows, ...next];
  }
  return changed ? next : current;
}

export function removeAssetRow(current: AssetRequest[], id: string): AssetRequest[] {
  const index = current.findIndex((item) => assetId(item) === id);
  if (index < 0) return current;
  return [...current.slice(0, index), ...current.slice(index + 1)];
}

export function applyAssetChange(
  current: AssetRequest[],
  change: AssetLiveChange,
  shouldContain: ShouldContainAsset = alwaysContain
): AssetRequest[] {
  if (change.type === 'DELETE') {
    return removeAssetRow(current, change.id);
  }
  return mergeAssetRows(current, [change.row], shouldContain);
}
