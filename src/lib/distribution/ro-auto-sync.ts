/**
 * Logika keputusan auto-sync untuk halaman Kelola RO.
 *
 * Halaman hanya membaca Supabase. Supaya data Sheet yang baru masuk tidak
 * menunggu cron harian, halaman memeriksa sync RO terakhir lalu menarik Sheet
 * sendiri bila sudah terlalu lama. Helper ini murni agar keputusan tersebut
 * bisa diuji tanpa browser.
 */

export const RO_AUTO_SYNC_MIN_INTERVAL_MS = 60 * 1000;

export interface RoSyncStatusSnapshot {
  /** True bila ada run sync yang masih berjalan. */
  running: boolean;
  /** Waktu selesai sync request-orders sukses terakhir, atau null. */
  lastSyncAt: string | null;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function latestIso(values: unknown[]): string | null {
  let best: { iso: string; time: number } | null = null;
  for (const value of values) {
    const time = parseTime(value);
    if (time === null) continue;
    if (!best || time > best.time) best = { iso: value as string, time };
  }
  return best?.iso ?? null;
}

/**
 * Baca respons `/api/sync/status`.
 *
 * Prioritas: source `request-orders` yang sukses (waktu `finished_at`), lalu
 * fallback ke run selesai non-dry-run yang sukses/partial. Dry-run, run gagal,
 * dan run yang masih RUNNING tidak dianggap sebagai sync RO yang valid.
 */
export function readRoStatusSnapshot(payload: unknown): RoSyncStatusSnapshot {
  const data =
    payload && typeof payload === 'object' ? (payload as Record<string, any>) : {};
  const running = Boolean(data.running);

  const sources = Array.isArray(data.sources) ? data.sources : [];
  const successfulSourceTimes = sources
    .filter(
      (source: any) =>
        source &&
        source.source_key === 'request-orders' &&
        source.status === 'SUCCESS'
    )
    .map((source: any) => source.finished_at);
  const lastSourceSync = latestIso(successfulSourceTimes);
  if (lastSourceSync) {
    return { running, lastSyncAt: lastSourceSync };
  }

  const runs = Array.isArray(data.runs) ? data.runs : [];
  const completedRunTimes = runs
    .filter(
      (run: any) =>
        run &&
        run.dry_run !== true &&
        (run.status === 'SUCCESS' || run.status === 'PARTIAL')
    )
    .map((run: any) => run.started_at);

  return { running, lastSyncAt: latestIso(completedRunTimes) };
}

/**
 * Auto-sync hanya bila tidak ada run aktif dan sync RO terakhir sudah lewat
 * dari interval minimum. Timestamp tidak valid dianggap "belum pernah sync".
 */
export function shouldAutoSync(
  snapshot: RoSyncStatusSnapshot,
  now: Date = new Date(),
  minIntervalMs: number = RO_AUTO_SYNC_MIN_INTERVAL_MS
): boolean {
  if (snapshot.running) return false;
  const lastSync = parseTime(snapshot.lastSyncAt);
  if (lastSync === null) return true;
  return now.getTime() - lastSync >= minIntervalMs;
}
