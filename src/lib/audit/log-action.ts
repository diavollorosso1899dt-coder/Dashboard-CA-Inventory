import type { AuditActionType, AuditEntityType } from '@/lib/supabase/types';

/**
 * Satu log audit hanya menampilkan satu opsi tindakan agar tidak ambigu:
 * - `revert`        : kembalikan data ke kondisi sebelumnya / pulihkan dari sampah
 * - `delete-entity` : hapus data terkait (dipindahkan ke Tempat Sampah)
 * - `delete-log`    : hapus catatan log saja (data aslinya sudah tidak ada)
 */
export type AuditLogActionKind = 'revert' | 'delete-entity' | 'delete-log';

export interface AuditLogActionInput {
  action_type: AuditActionType | string;
  entity_type: AuditEntityType | string;
  entity_id?: string | null;
  previous_state?: unknown;
  new_state?: unknown;
}

/** Tabel aktif untuk setiap entitas yang datanya bisa dihapus/dipulihkan. */
export const AUDIT_ENTITY_TABLES: Record<string, string> = {
  ASET: 'asset_requests',
  OUTLET: 'outlets',
  SURAT_JALAN: 'surat_jalan',
  DISPOSISI: 'disposition_requests',
  TRANSFER: 'asset_transfers',
  RO: 'request_orders',
  PENGGUNA: 'user_profiles',
};

const REVERTABLE_ENTITY_TYPES = new Set(Object.keys(AUDIT_ENTITY_TABLES));
const REVERT_ACTIONS = new Set(['UPDATE', 'STATUS_CHANGE', 'REVERT']);
const DELETE_ENTITY_ACTIONS = new Set(['CREATE', 'RESTORE']);

function hasPreviousState(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

/** Apakah data pada log ini masih bisa dikembalikan / dipulihkan? */
export function canRevertAuditLog(log: AuditLogActionInput): boolean {
  if (log.action_type === 'DELETE_TO_TRASH') {
    return Boolean(log.entity_id);
  }

  return (
    REVERT_ACTIONS.has(log.action_type) &&
    REVERTABLE_ENTITY_TYPES.has(log.entity_type) &&
    Boolean(log.entity_id) &&
    hasPreviousState(log.previous_state)
  );
}

/** Apakah log ini mencatat data baru yang bisa dihapus kembali? */
export function canDeleteAuditEntity(log: AuditLogActionInput): boolean {
  return (
    DELETE_ENTITY_ACTIONS.has(log.action_type) &&
    REVERTABLE_ENTITY_TYPES.has(log.entity_type) &&
    Boolean(log.entity_id)
  );
}

export function resolveAuditLogAction(log: AuditLogActionInput): AuditLogActionKind {
  if (canRevertAuditLog(log)) return 'revert';
  if (canDeleteAuditEntity(log)) return 'delete-entity';
  return 'delete-log';
}

export interface AuditLogActionMeta {
  label: string;
  title: string;
}

export function auditLogActionMeta(kind: AuditLogActionKind): AuditLogActionMeta {
  switch (kind) {
    case 'revert':
      return {
        label: 'Kembalikan',
        title: 'Kembalikan perubahan ini ke kondisi sebelumnya',
      };
    case 'delete-entity':
      return {
        label: 'Hapus',
        title: 'Hapus data terkait (dipindahkan ke Tempat Sampah)',
      };
    default:
      return {
        label: 'Hapus Log',
        title: 'Hapus catatan log ini dari riwayat audit',
      };
  }
}