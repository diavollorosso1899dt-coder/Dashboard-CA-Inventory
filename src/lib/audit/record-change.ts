import { AuditActionType, AuditEntityType, AuditLogEntry } from '@/lib/supabase/types';
import { resolveActor } from '@/lib/auth/actor';
import { recordAuditLog } from './audit-store';
import { inferActionType, summarizeChanges } from './change-summary';

interface AuditRequestLike {
  headers: Headers;
}

export interface AuditMutationParams {
  entityType: AuditEntityType;
  entityTitle: string;
  entityId?: string;
  /** Kondisi sebelum perubahan (untuk UPDATE/DELETE). */
  previous?: unknown;
  /** Data yang dikirim/diubah (untuk UPDATE/CREATE). */
  next?: unknown;
  /** Paksa tipe aksi bila tidak ingin dideteksi otomatis. */
  actionType?: AuditActionType;
  /** Detail khusus; jika kosong memakai ringkasan perubahan otomatis. */
  details?: string;
  previousState?: unknown;
  newState?: unknown;
  /** Identitas dari body request (mis. bulk delete). */
  bodyActor?: { name?: string | null; role?: string | null } | null;
}

/**
 * Catat perubahan user ke audit_logs Supabase.
 *
 * Untuk UPDATE, log hanya dibuat jika memang ada field yang berubah.
 * Return null berarti tidak ada yang perlu dicatat.
 */
export async function auditMutation(
  req: AuditRequestLike,
  params: AuditMutationParams
): Promise<AuditLogEntry | null> {
  const actor = resolveActor(req, params.bodyActor);
  const isCreate = params.previous === undefined || params.previous === null;
  const summary =
    params.previous !== undefined && params.next !== undefined
      ? summarizeChanges(params.previous, params.next)
      : null;

  if (!params.actionType && summary && summary.changedKeys.length === 0) {
    return null;
  }

  const actionType =
    params.actionType || inferActionType(params.previous ?? null, summary || { changedKeys: [] });

  const details =
    params.details ||
    summary?.details ||
    (isCreate ? `Membuat data ${params.entityTitle}` : `Memperbarui ${params.entityTitle}`);

  return recordAuditLog(
    actor.name,
    actor.role,
    actionType,
    params.entityType,
    params.entityTitle,
    details,
    {
      entityId: params.entityId,
      previousState: params.previousState ?? summary?.previousState,
      newState: params.newState ?? summary?.newState,
    }
  );
}

/** Catat aksi hapus ke Tempat Sampah beserta kondisi terakhirnya. */
export async function auditDeleteToTrash(
  req: AuditRequestLike,
  params: {
    entityType: AuditEntityType;
    entityTitle: string;
    entityId?: string;
    previous?: unknown;
    details: string;
    bodyActor?: { name?: string | null; role?: string | null } | null;
  }
): Promise<AuditLogEntry> {
  const actor = resolveActor(req, params.bodyActor);
  return recordAuditLog(
    actor.name,
    actor.role,
    'DELETE_TO_TRASH',
    params.entityType,
    params.entityTitle,
    params.details,
    {
      entityId: params.entityId,
      previousState: params.previous,
    }
  );
}

/** Catat aktivitas sistem (sync, rollover, dsb) tanpa pelaku user tertentu. */
export async function auditSystem(
  entityType: AuditEntityType,
  entityTitle: string,
  details: string,
  options?: { entityId?: string; previousState?: any; newState?: any }
): Promise<AuditLogEntry> {
  return recordAuditLog('System', 'System', 'UPDATE', entityType, entityTitle, details, options);
}