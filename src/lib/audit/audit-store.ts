import { TrashItem, AuditLogEntry, AuditEntityType, TrashEntityType, AuditActionType } from '@/lib/supabase/types';
import { getAdminClient, updateAssetRequest, updateAssetTransfer } from '@/lib/supabase/server';

// In-memory fallback. Data utama selalu disimpan di Supabase (tabel
// audit_logs & trash_items); memori hanya dipakai bila koneksi DB gagal.
interface AuditStoreState {
  trash: TrashItem[];
  logs: AuditLogEntry[];
}

const globalForAudit = globalThis as unknown as {
  _auditStore?: AuditStoreState;
};

const auditStore: AuditStoreState = globalForAudit._auditStore || {
  trash: [],
  logs: [],
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
  entityType: AuditEntityType,
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

  // Simpan ke Supabase lebih dulu; memori hanya cadangan bila DB gagal.
  let persisted = false;
  try {
    const admin = getAdminClient();
    if (admin) {
      const { error } = await admin.from('audit_logs').insert([newEntry]);
      if (error) {
        console.error('[audit] Gagal menyimpan log ke Supabase:', error.message);
      } else {
        persisted = true;
      }
    } else {
      console.error('[audit] Supabase admin client tidak tersedia; log hanya di memori.');
    }
  } catch (err: any) {
    console.error('[audit] Gagal menyimpan log ke Supabase:', err?.message || err);
  }

  if (!persisted) {
    auditStore.logs.unshift(newEntry);
    if (auditStore.logs.length > 500) {
      auditStore.logs = auditStore.logs.slice(0, 500);
    }
  }

  return newEntry;
}

export async function getAuditLogs(options?: {
  search?: string;
  actionType?: string;
  limit?: number;
}): Promise<{ data: AuditLogEntry[]; total: number }> {
  const limit = options?.limit || 100;

  // Try fetching from Supabase first
  try {
    const admin = getAdminClient();
    if (admin) {
      let query = admin.from('audit_logs').select('*', { count: 'exact' });
      
      if (options?.actionType && options.actionType !== 'ALL') {
        query = query.eq('action_type', options.actionType);
      }
      
      if (options?.search) {
        const s = options.search;
        query = query.or(`entity_title.ilike.%${s}%,details.ilike.%${s}%,actor_name.ilike.%${s}%`);
      }
      
      query = query.order('timestamp', { ascending: false }).limit(limit);
      
      const { data, count, error } = await query;
      if (!error) {
        const dbRows = (data || []) as AuditLogEntry[];
        // Sertakan log yang sempat gagal tersimpan ke DB (fallback memori).
        const seen = new Set(dbRows.map((row) => row.id));
        const memoryOnly = auditStore.logs.filter((row) => !seen.has(row.id));
        const combined = memoryOnly.length > 0
          ? [...dbRows, ...memoryOnly].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit)
          : dbRows;
        return { data: combined, total: (count || dbRows.length) + memoryOnly.length };
      }
      console.error('Gagal ambil audit_logs dari Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Gagal ambil audit_logs dari Supabase, fallback ke memory', err);
  }

  // Fallback to memory store
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
  let log = auditStore.logs.find((l) => l.id === logId);
  if (!log) {
    try {
      const admin = getAdminClient();
      if (admin) {
        const { data, error } = await admin.from('audit_logs').select('*').eq('id', logId).single();
        if (!error && data) log = data as AuditLogEntry;
      }
    } catch (err) {
      console.warn('[audit] Gagal ambil log untuk revert dari Supabase:', err);
    }
  }
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
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from('trash_items')
        .select('*')
        .order('deleted_at', { ascending: false });
        
      if (!error) {
        return (data || []) as TrashItem[];
      }
      console.error('Gagal ambil trash_items dari Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Gagal ambil trash_items dari Supabase, fallback ke memory', err);
  }

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

  // Persist ke Supabase trash_items
  let persisted = false;
  try {
    const admin = getAdminClient();
    if (admin) {
      const { error } = await admin.from('trash_items').insert([trashItem]);
      if (error) {
        console.error('[audit] Gagal menyimpan trash item ke Supabase:', error.message);
      } else {
        persisted = true;
      }
    }
  } catch (err) {
    console.warn('Gagal memindahkan ke trash_items di Supabase', err);
  }

  if (persisted) {
    auditStore.trash = auditStore.trash.filter((item) => item.id !== trashItem.id);
  }

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
  let itemToRestore: TrashItem | undefined = undefined;
  let fromMemory = false;

  const index = auditStore.trash.findIndex((t) => t.id === trashId);
  if (index !== -1) {
    itemToRestore = auditStore.trash[index];
    fromMemory = true;
  } else {
    // Coba cari di Supabase
    try {
      const admin = getAdminClient();
      if (admin) {
        const { data, error } = await admin.from('trash_items').select('*').eq('id', trashId).single();
        if (!error && data) {
          itemToRestore = data as TrashItem;
        }
      }
    } catch (err) {
      console.warn('Gagal ambil item dari trash_items di Supabase', err);
    }
  }

  if (!itemToRestore) {
    return { success: false, error: 'Item tidak ditemukan di tempat sampah' };
  }

  // Try removing from Supabase
  try {
    const admin = getAdminClient();
    if (admin) {
      await admin.from('trash_items').delete().eq('id', trashId);
    }
  } catch (err) {
    console.warn('Gagal menghapus dari trash_items di Supabase', err);
  }

  if (fromMemory) {
    auditStore.trash.splice(index, 1);
  }
  
  const item = itemToRestore;

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
  let item: TrashItem | undefined;
  const index = auditStore.trash.findIndex((t) => t.id === trashId);
  if (index !== -1) {
    [item] = auditStore.trash.splice(index, 1);
  } else {
    try {
      const admin = getAdminClient();
      if (admin) {
        const { data, error } = await admin.from('trash_items').select('*').eq('id', trashId).single();
        if (!error && data) item = data as TrashItem;
      }
    } catch (err) {
      console.warn('[permanentDeleteItem] Gagal ambil item dari Supabase:', err);
    }
  }

  if (!item) {
    return { success: false, error: 'Item tidak ditemukan di tempat sampah' };
  }

  // If hard deleting from Supabase
  try {
    const admin = getAdminClient();
    if (admin) {
      await admin.from('trash_items').delete().eq('id', trashId);
      if (item.entity_id) {
        if (item.entity_type === 'ASET') {
          await admin.from('asset_requests').delete().eq('id', item.entity_id);
        }
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
  let totalDeleted = auditStore.trash.length;
  auditStore.trash = [];

  try {
    const admin = getAdminClient();
    if (admin) {
      const { count } = await admin
        .from('trash_items')
        .select('id', { count: 'exact', head: true });
      if (typeof count === 'number') totalDeleted = count;
      await admin.from('trash_items').delete().not('id', 'is', null);
    }
  } catch (err) {
    console.warn('[emptyAllTrash] Gagal mengosongkan trash_items di Supabase:', err);
  }

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
