import { getAdminClient } from '@/lib/supabase/server';
import type { RegionHealthMap } from './types.ts';
import { staleRegionScope } from './stale.ts';

const NULL_OR_OLDER = (runStartedAt: string) =>
  `last_seen_at.is.null,last_seen_at.lt.${runStartedAt}`;

function isMissingColumnError(message?: string): boolean {
  return Boolean(message && /last_seen_at|is_stale/.test(message));
}

/**
 * Tandai baris aset yang tidak lagi muncul di sheet sebagai stale.
 * Baris tidak pernah dihapus; hanya diberi penanda agar bisa difilter manual.
 * Hanya region yang sheet-nya berhasil dibaca yang boleh ditandai.
 */
export async function markAssetRowsStale(
  runStartedAt: string,
  regions: RegionHealthMap
): Promise<number> {
  const admin = getAdminClient();
  if (!admin) return 0;
  const scope = staleRegionScope(regions);
  if (scope === 'NONE') return 0;

  const prefixes =
    scope === 'ALL'
      ? ['JABO-ROW', 'KALBAR-ROW']
      : [scope === 'JABODETABEK' ? 'JABO-ROW' : 'KALBAR-ROW'];

  let total = 0;
  for (const prefix of prefixes) {
    const { data, error } = await admin
      .from('asset_requests')
      .update({ is_stale: true })
      .like('external_id', `${prefix}%`)
      .eq('is_stale', false)
      .or(NULL_OR_OLDER(runStartedAt))
      .select('id');
    if (error) {
      if (!isMissingColumnError(error.message)) {
        console.warn('[sync] Gagal menandai aset stale:', error.message);
      }
      continue;
    }
    total += data?.length ?? 0;
  }
  return total;
}

/** Tandai RO dari Google Sheet yang tidak lagi muncul di sheet sebagai stale. */
export async function markRoRowsStale(
  runStartedAt: string,
  regions: RegionHealthMap
): Promise<number> {
  const admin = getAdminClient();
  if (!admin) return 0;
  const scope = staleRegionScope(regions);
  if (scope === 'NONE') return 0;

  let query = admin
    .from('request_orders')
    .update({ is_stale: true })
    .eq('source_type', 'GOOGLE_SHEET')
    .eq('is_stale', false)
    .or(NULL_OR_OLDER(runStartedAt));

  if (scope !== 'ALL') {
    query = query.eq('region', scope);
  }

  const { data, error } = await query.select('id');
  if (error) {
    if (!isMissingColumnError(error.message)) {
      console.warn('[sync] Gagal menandai RO stale:', error.message);
    }
    return 0;
  }
  return data?.length ?? 0;
}