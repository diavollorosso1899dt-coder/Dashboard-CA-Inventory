import { TrashItem, AuditLogEntry, TrashEntityType, AuditActionType } from '@/lib/supabase/types';
import { getAdminClient, updateAssetRequest, updateAssetTransfer } from '@/lib/supabase/server';

// In-Memory store fallback with initial seed logs for immediate usability
interface AuditStoreState {
  trash: TrashItem[];
  logs: AuditLogEntry[];
}

const globalForAudit = globalThis as unknown as {
  _auditStore?: AuditStoreState;
};

const initialSeedLogs: AuditLogEntry[] = [
  {
    id: 'log-seed-1',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    actor_name: 'Super User',
    actor_role: 'Super User',
    action_type: 'CREATE',
    entity_type: 'ASET',
    entity_id: 'sample-1',
    entity_title: 'Chiller Undercounter 2 Pintu',
    details: 'Mendaftarkan item aset baru untuk cabang Mie Ayam Muntjul Karawang (RAB-2026-MUNTJUL-001)',
  },
  {
    id: 'log-seed-2',
    timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
    actor_name: 'Staff Logistik',
    actor_role: 'User',
    action_type: 'STATUS_CHANGE',
    entity_type: 'ASET',
    entity_id: 'sample-2',
    entity_title: 'Meja Kasir Stainless 120cm',
    details: 'Mengubah status pengiriman dari "Belum Ready" menjadi "Ready Antar"',
    previous_state: { item_delivery_status: 'Belum Ready' },
    new_state: { item_delivery_status: 'Ready Antar' },
  },
  {
    id: 'log-seed-3',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    actor_name: 'Admin Audit',
    actor_role: 'Manajemen Sampah & Log',
    action_type: 'UPDATE',
    entity_type: 'SYSTEM',
    entity_title: 'Rebranding Sistem',
    details: 'Pembaruan identitas brand menjadi HANTARAN dan konfigurasi column visibility',
  },
];

const initialSeedTrash: TrashItem[] = [
  {
    id: 'trash-seed-1',
    entity_type: 'ASET',
    entity_id: 'old-asset-001',
    title: 'Kursi Plastik Napolly Hijau (Sample)',
    subtitle: 'Cabang Mie Ayam Muntjul Karawang • Kategori General',
    category: 'General',
    region: 'JABODETABEK',
    deleted_by: 'Staff Logistik',
    deleted_by_role: 'User',
    deleted_at: new Date(Date.now() - 3600000 * 16).toISOString(),
    notes: 'Item duplikat saat input manual',
    original_data: {
      item_name: 'Kursi Plastik Napolly Hijau (Sample)',
      branch_name: 'Mie Ayam Muntjul Karawang',
      classification: 'General',
      quantity_needed: 10,
      rab_price: 65000,
      rab_number: 'RAB-2026-MUNTJUL-001',
    },
  },
];

const auditStore: AuditStoreState = globalForAudit._auditStore || {
  trash: initialSeedTrash,
  logs: initialSeedLogs,
};

if (process.env.NODE_ENV !== 'production') {
  globalForAudit._auditStore = auditStore;
}

// -------------------------------------------------------------
// AUDIT LOG SERVICE
// -------------------------------------------------------------
export async function recordAuditLog(
  actorName: string,
  actorRole: string,
  actionType: AuditActionType,
  entityType: TrashEntityType | 'PENGGUNA' | 'SYSTEM',
  entityTitle: string,
  details: string,
  options?: {
    entityId?: string;
    previousState?: any;
    newState?: any;
  }
): Promise<AuditLogEntry> {
  const newEntry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    actor_name: actorName || 'System',
    actor_role: actorRole || 'User',
    action_type: actionType,
    entity_type: entityType,
    entity_id: options?.entityId,
    entity_title: entityTitle,
    details,
    previous_state: options?.previousState,
    new_state: options?.newState,
  };

  auditStore.logs.unshift(newEntry);

  // Keep max 500 recent logs in memory
  if (auditStore.logs.length > 500) {
    auditStore.logs = auditStore.logs.slice(0, 500);
  }

  // Attempt to persist to Supabase audit_logs table if available
  try {
    const admin = getAdminClient();
    if (admin) {
      await admin.from('audit_logs').insert([newEntry]);
    }
  } catch {
    // Graceful fallback to memory store
  }

  return newEntry;
}

export async function getAuditLogs(options?: {
  search?: string;
  actionType?: string;
  limit?: number;
}): Promise<{ data: AuditLogEntry[]; total: number }> {
  let list = [...auditStore.logs];

  if (options?.actionType && options.actionType !== 'ALL') {
    list = list.filter((l) => l.action_type === options.actionType);
  }

  if (options?.search) {
    const s = options.search.toLowerCase();
    list = list.filter(
      (l) =>
        l.entity_title.toLowerCase().includes(s) ||
        l.details.toLowerCase().includes(s) ||
        l.actor_name.toLowerCase().includes(s)
    );
  }

  const limit = options?.limit || 100;
  return {
    data: list.slice(0, limit),
    total: list.length,
  };
}

/**
 * Revert an audit log entry back to its previous state (Superuser Undo / Rollback)
 */
export async function revertAuditLog(
  logId: string,
  actorName: string,
  actorRole: string
): Promise<{ success: boolean; message: string; data?: AuditLogEntry }> {
  const log = auditStore.logs.find((l) => l.id === logId);
  if (!log) {
    return { success: false, message: 'Catatan log tidak ditemukan.' };
  }

  if (!log.previous_state || Object.keys(log.previous_state).length === 0) {
    return { 
      success: false, 
      message: 'Log ini tidak memiliki data kondisi sebelumnya (previous state) untuk dikembalikan.' 
    };
  }

  try {
    // 1. Rollback entity data based on entity_type
    if (log.entity_type === 'ASET' && log.entity_id) {
      const res = await updateAssetRequest(log.entity_id, log.previous_state);
      if (!res.success) {
        return { success: false, message: res.error || 'Gagal mengembalikan data aset di basis data.' };
      }
    } else if (log.entity_type === 'TRANSFER' && log.entity_id) {
      await updateAssetTransfer(log.entity_id, log.previous_state);
    }

    // 2. Record new audit log for the REVERT action
    const revertEntry = await recordAuditLog(
      actorName || 'Super User',
      actorRole || 'Super User',
      'REVERT',
      log.entity_type,
      log.entity_title,
      `Mengembalikan perubahan (${log.action_type}) ke kondisi sebelumnya dari log #${log.id.slice(-6)}. Nilai dikembalikan: ${JSON.stringify(log.previous_state)}`,
      {
        entityId: log.entity_id,
        previousState: log.new_state,
        newState: log.previous_state,
      }
    );

    return {
      success: true,
      message: `Perubahan pada "${log.entity_title}" berhasil dikembalikan ke kondisi sebelumnya.`,
      data: revertEntry,
    };
  } catch (err: any) {
    console.error('Error reverting audit log:', err);
    return { success: false, message: `Terjadi kesalahan saat revert: ${err.message}` };
  }
}

// -------------------------------------------------------------
// TRASH / RECYCLE BIN SERVICE
// -------------------------------------------------------------
export async function getTrashItems(): Promise<TrashItem[]> {
  return [...auditStore.trash];
}

export async function moveItemToTrash(
  entityType: TrashEntityType,
  entityId: string,
  title: string,
  subtitle: string,
  originalData: any,
  actorName: string = 'Super User',
  actorRole: string = 'Super User',
  notes?: string
): Promise<TrashItem> {
  const trashItem: TrashItem = {
    id: `trash-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    entity_type: entityType,
    entity_id: entityId,
    title,
    subtitle,
    category: originalData?.category || originalData?.classification || 'General',
    region: originalData?.region || 'JABODETABEK',
    deleted_by: actorName,
    deleted_by_role: actorRole,
    deleted_at: new Date().toISOString(),
    notes: notes || 'Dipindahkan ke tempat sampah',
    original_data: originalData,
  };

  auditStore.trash.unshift(trashItem);

  // Record Audit Trail
  await recordAuditLog(
    actorName,
    actorRole,
    'DELETE_TO_TRASH',
    entityType,
    title,
    `Data ${title} (${entityType}) dipindahkan ke Tempat Sampah oleh ${actorName}`,
    { entityId, previousState: originalData }
  );

  return trashItem;
}

export async function restoreItemFromTrash(
  trashId: string,
  actorName: string = 'Super User',
  actorRole: string = 'Super User'
): Promise<{ success: boolean; restoredItem?: TrashItem; error?: string }> {
  const index = auditStore.trash.findIndex((t) => t.id === trashId);
  if (index === -1) {
    return { success: false, error: 'Item tidak ditemukan di tempat sampah' };
  }

  const [item] = auditStore.trash.splice(index, 1);

  // If restoring an Asset, reinsert back to Supabase / memory cache
  try {
    if (item.entity_type === 'ASET') {
      const admin = getAdminClient();
      if (admin && item.original_data?.id) {
        await admin.from('asset_requests').upsert([item.original_data]);
      }
    }
  } catch (err) {
    console.warn('[restoreItemFromTrash] Failed restoring to Supabase:', err);
  }

  // Record Audit Trail
  await recordAuditLog(
    actorName,
    actorRole,
    'RESTORE',
    item.entity_type,
    item.title,
    `Data ${item.title} (${item.entity_type}) berhasil dipulihkan kembali ke sistem aktif oleh ${actorName}`,
    { entityId: item.entity_id, newState: item.original_data }
  );

  return { success: true, restoredItem: item };
}

export async function permanentDeleteItem(
  trashId: string,
  actorName: string = 'Super User',
  actorRole: string = 'Super User'
): Promise<{ success: boolean; deletedItem?: TrashItem; error?: string }> {
  const index = auditStore.trash.findIndex((t) => t.id === trashId);
  if (index === -1) {
    return { success: false, error: 'Item tidak ditemukan di tempat sampah' };
  }

  const [item] = auditStore.trash.splice(index, 1);

  // If hard deleting from Supabase
  try {
    const admin = getAdminClient();
    if (admin && item.entity_id) {
      if (item.entity_type === 'ASET') {
        await admin.from('asset_requests').delete().eq('id', item.entity_id);
      }
    }
  } catch (err) {
    console.warn('[permanentDeleteItem] Hard delete error:', err);
  }

  // Record Audit Trail
  await recordAuditLog(
    actorName,
    actorRole,
    'PERMANENT_DELETE',
    item.entity_type,
    item.title,
    `Data ${item.title} (${item.entity_type}) telah DIHAPUS SECARA PERMANEN oleh ${actorName}. Data tidak dapat dipulihkan lagi.`,
    { entityId: item.entity_id }
  );

  return { success: true, deletedItem: item };
}

export async function emptyAllTrash(
  actorName: string = 'Super User',
  actorRole: string = 'Super User'
): Promise<{ count: number }> {
  const totalDeleted = auditStore.trash.length;
  auditStore.trash = [];

  // Record Audit Trail
  await recordAuditLog(
    actorName,
    actorRole,
    'EMPTY_TRASH',
    'SYSTEM',
    'Tempat Sampah',
    `${actorName} mengosongkan seluruh isi Tempat Sampah (${totalDeleted} item dihapus permanen)`
  );

  return { count: totalDeleted };
}
