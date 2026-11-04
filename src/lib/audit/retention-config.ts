/**
 * Aturan retensi audit log (tanpa dependensi Supabase, mudah diuji).
 *
 * Log lebih tua dari `AUDIT_LOG_RETENTION_DAYS` dihapus otomatis.
 * Penghapusan berbasis cutoff waktu, bukan "hapus semua log tiap 7 hari".
 */
export const AUDIT_LOG_RETENTION_DAYS = 7;

/** Batas aman nilai retensi: minimal 1 hari, maksimal 10 tahun. */
export function normalizeRetentionDays(value?: number | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return AUDIT_LOG_RETENTION_DAYS;
  return Math.min(Math.floor(parsed), 3650);
}

/**
 * Tentukan retensi dari nilai eksplisit, lalu env `AUDIT_LOG_RETENTION_DAYS`,
 * lalu default 7 hari. Nilai tidak valid selalu kembali ke default.
 */
export function resolveRetentionDays(value?: number | string | null): number {
  if (value === undefined || value === null || value === '') {
    return normalizeRetentionDays(Number(process.env.AUDIT_LOG_RETENTION_DAYS));
  }
  return normalizeRetentionDays(Number(value));
}

/** Hitung batas waktu: log dengan timestamp < cutoff akan dihapus. */
export function computeAuditLogCutoff(
  retentionDays: number = AUDIT_LOG_RETENTION_DAYS,
  now: number = Date.now()
): string {
  const days = normalizeRetentionDays(retentionDays);
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}