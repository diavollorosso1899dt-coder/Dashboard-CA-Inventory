import { getAdminClient } from '@/lib/supabase/server';
import { recordAuditLog } from './audit-store';
import {
  AUDIT_LOG_RETENTION_DAYS,
  computeAuditLogCutoff,
  normalizeRetentionDays,
} from './retention-config';
import {
  DELETE_BATCH_SIZE,
  MAX_BATCHES,
  AuditLogRetentionClient,
  purgeOlderThan,
} from './retention-core';

export { AUDIT_LOG_RETENTION_DAYS, computeAuditLogCutoff, normalizeRetentionDays };
export { DELETE_BATCH_SIZE, MAX_BATCHES };

/**
 * Retensi audit log.
 *
 * Log perubahan hanya disimpan selama 7 hari. Setelah itu dihapus otomatis
 * supaya tabel `audit_logs` tidak terus membengkak. Penghapusan memakai
 * cutoff waktu (bukan "hapus semua log tiap 7 hari"), jadi log baru tetap aman.
 *
 * Pemicu utama: Vercel Cron -> GET /api/audit/cleanup.
 * Jaring pengaman: sapuan oportunistik (throttled) dari endpoint audit log.
 */

/** Jeda minimum antar sapuan oportunistik (6 jam). */
const OPPORTUNISTIC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface PurgeAuditLogsOptions {
  /** Umur log yang dipertahankan. Default 7 hari, dibatasi 1..3650. */
  retentionDays?: number;
  /** Hanya hitung, jangan hapus. */
  dryRun?: boolean;
  actorName?: string;
  actorRole?: string;
  /** Sumber pemanggilan, dipakai di detail log sistem. */
  trigger?: 'cron' | 'manual' | 'opportunistic';
}

export interface PurgeAuditLogsResult {
  success: boolean;
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  /** Jumlah log yang lebih tua dari cutoff saat pemeriksaan. */
  matched: number;
  /** Jumlah log yang benar-benar terhapus. */
  deleted: number;
  error?: string;
}

function isMissingTableError(message?: string): boolean {
  if (!message) return false;
  return /relation .*audit_logs.* does not exist|Could not find the table/i.test(message);
}

function createSupabaseRetentionClient(admin: NonNullable<ReturnType<typeof getAdminClient>>): AuditLogRetentionClient {
  return {
    async countOlderThan(cutoff) {
      const { count, error } = await admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .lt('timestamp', cutoff);
      return { count, error: error?.message };
    },
    async listIdsOlderThan(cutoff, limit) {
      const { data, error } = await admin
        .from('audit_logs')
        .select('id')
        .lt('timestamp', cutoff)
        .limit(limit);
      return {
        ids: (data || []).map((row: { id: string }) => row.id),
        error: error?.message,
      };
    },
    async deleteByIds(ids) {
      const { error } = await admin.from('audit_logs').delete().in('id', ids);
      return { error: error?.message };
    },
  };
}

/**
 * Hapus log yang lebih tua dari `retentionDays`.
 *
 * Selalu menghitung dulu, lalu menghapus per batch. Bila `dryRun` aktif,
 * tidak ada baris yang dihapus dan hasil `matched` bisa dipakai untuk preview.
 */
export async function purgeOldAuditLogs(
  options: PurgeAuditLogsOptions = {}
): Promise<PurgeAuditLogsResult> {
  const retentionDays = normalizeRetentionDays(options.retentionDays);
  const cutoff = computeAuditLogCutoff(retentionDays);
  const dryRun = options.dryRun === true;

  const base: PurgeAuditLogsResult = {
    success: false,
    dryRun,
    retentionDays,
    cutoff,
    matched: 0,
    deleted: 0,
  };

  const admin = getAdminClient();
  if (!admin) {
    return { ...base, error: 'Supabase belum dikonfigurasi di server.' };
  }

  try {
    const result = await purgeOlderThan(createSupabaseRetentionClient(admin), cutoff, {
      dryRun,
    });

    // Tabel belum dibuat: anggap tidak ada yang perlu dibersihkan.
    if (result.error && isMissingTableError(result.error)) {
      return { ...base, success: true };
    }

    if (result.deleted > 0) {
      // Catat jejak pembersihan supaya masih ada bukti di audit trail.
      await recordAuditLog(
        options.actorName || 'System',
        options.actorRole || 'System',
        'PERMANENT_DELETE',
        'SYSTEM',
        `Retensi audit log ${retentionDays} hari`,
        `${result.deleted} log lebih lama dari ${cutoff} dihapus otomatis (${options.trigger || 'manual'}).`,
        {
          newState: {
            deleted: result.deleted,
            cutoff,
            retentionDays,
            trigger: options.trigger || 'manual',
          },
        }
      );
    }

    return {
      ...base,
      success: !result.error,
      matched: result.matched,
      deleted: result.deleted,
      error: result.error,
    };
  } catch (err: any) {
    return { ...base, error: err?.message || 'Gagal membersihkan audit log.' };
  }
}

const globalForRetention = globalThis as unknown as {
  _auditRetentionLastRun?: number;
};

/**
 * Sapuan oportunistik: dijalankan paling sering sekali per 6 jam.
 * Nonaktifkan dengan env `AUDIT_LOG_AUTO_PURGE=off`.
 */
export async function maybePurgeOldAuditLogs(): Promise<PurgeAuditLogsResult | null> {
  if (process.env.AUDIT_LOG_AUTO_PURGE === 'off') return null;

  const now = Date.now();
  const lastRun = globalForRetention._auditRetentionLastRun || 0;
  if (now - lastRun < OPPORTUNISTIC_INTERVAL_MS) return null;
  globalForRetention._auditRetentionLastRun = now;

  try {
    return await purgeOldAuditLogs({ trigger: 'opportunistic' });
  } catch (err) {
    console.warn('[audit] Sapuan retensi gagal:', err);
    return null;
  }
}