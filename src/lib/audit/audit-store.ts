import { TrashItem, AuditLogEntry, AuditEntityType, TrashEntityType, AuditActionType } from '@/lib/supabase/types';
import {
  deleteAssetTransfer,
  deleteRequestOrder,
  deleteSuratJalan,
  deleteUserProfile,
  getAdminClient,
  updateAssetRequest,
  updateAssetTransfer,
  updateRequestOrder,
} from '@/lib/supabase/server';
import { removeTombstonesByKeys } from '@/lib/sync-engine/tombstones';
import { AUDIT_ENTITY_TABLES } from './log-action';

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

/** Ambil satu catatan audit log dari memori atau Supabase. */
export async function getAuditLogById(logId: string): Promise<AuditLogEntry | null> {
  const memoryLog = auditStore.logs.find((l) => l.id === logId);
  if (memoryLog) return memoryLog;

  try {
    const admin = getAdminClient();
    if (admin) {
      const { data, error } = await admin.from('audit_logs').select('*').eq('id', logId).maybeSingle();
      if (!error && data) return data as AuditLogEntry;
    }
  } catch (err) {
    console.warn('[audit] Gagal ambil log dari Supabase:', err);
  }

  return null;
}

/**
 * Revert an audit log entry back to its previous state (Superuser Undo / Rollback)
 */
export async function revertAuditLog(
  logId: string,
  actorName: string,
  actorRole: string
): Promise<{ success: boolean; message: string; data?: AuditLogEntry }> {
  const log = await getAuditLogById(logId);
  if (!log) {
    return { success: false, message: 'Catatan log tidak ditemukan.' };
  }

  const previousState = log.previous_state;
  if (
    !previousState ||
    typeof previousState !== 'object' ||
    Array.isArray(previousState) ||
    Object.keys(previousState).length === 0
  ) {
    return {
      success: false,
      message:
        'Log ini tidak memiliki kondisi sebelumnya yang dapat dikembalikan otomatis (mis. perubahan massal atau pembuatan data baru).',
    };
  }

  try {
    // 1. Kembalikan data entitas sesuai modulnya.
    if (log.entity_type === 'RO' && log.entity_id) {
      const ok = await updateRequestOrder(log.entity_id, previousState as any);
      if (!ok) {
        return {
          success: false,
          message: 'Gagal mengembalikan data RO ke Supabase. Pastikan dokumen RO masih ada.',
        };
      }
    } else if (log.entity_type === 'ASET' && log.entity_id) {
      const res = await updateAssetRequest(log.entity_id, previousState);
      if (!res.success) {
        return { success: false, message: res.error || 'Gagal mengembalikan data aset di basis data.' };
      }
    } else if (log.entity_type === 'TRANSFER' && log.entity_id) {
      await updateAssetTransfer(log.entity_id, previousState);
    } else {
      const tableByEntity: Record<string, string> = {
        OUTLET: 'outlets',
        PENGGUNA: 'user_profiles',
        SURAT_JALAN: 'surat_jalan',
        DISPOSISI: 'disposition_requests',
      };
      const table = tableByEntity[log.entity_type];
      if (!table) {
        return {
          success: false,
          message: `Revert otomatis belum didukung untuk modul ${log.entity_type}.`,
        };
      }
      if (!log.entity_id) {
        return { success: false, message: 'Log tidak menyimpan ID data sehingga tidak bisa dikembalikan.' };
      }
      const admin = getAdminClient();
      if (!admin) {
        return { success: false, message: 'Koneksi Supabase tidak tersedia.' };
      }
      const { data: updatedRows, error } = await admin
        .from(table)
        .update(previousState)
        .eq('id', log.entity_id)
        .select('id');
      if (error || !updatedRows || updatedRows.length === 0) {
        return {
          success: false,
          message: `Gagal mengembalikan data ${log.entity_type} di Supabase${error ? `: ${error.message}` : '.'}`,
        };
      }
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

/**
 * Hapus satu catatan audit log tanpa menyentuh data aslinya.
 * Dipakai untuk aksi yang datanya sudah tidak mungkin dikembalikan
 * (mis. PERMANENT_DELETE / EMPTY_TRASH).
 */
export async function deleteAuditLogEntry(
  logId: string
): Promise<{ success: boolean; message: string }> {
  let deleted = false;

  try {
    const admin = getAdminClient();
    if (admin) {
      const { error } = await admin.from('audit_logs').delete().eq('id', logId);
      if (error) {
        return { success: false, message: `Gagal menghapus catatan log: ${error.message}` };
      }
      deleted = true;
    }
  } catch (err: any) {
    console.error('[audit] Gagal menghapus catatan log:', err);
    return { success: false, message: `Gagal menghapus catatan log: ${err?.message || err}` };
  }

  const before = auditStore.logs.length;
  auditStore.logs = auditStore.logs.filter((l) => l.id !== logId);
  if (auditStore.logs.length !== before) deleted = true;

  if (!deleted) {
    return { success: false, message: 'Catatan log tidak ditemukan.' };
  }

  return { success: true, message: 'Catatan log berhasil dihapus dari riwayat audit.' };
}

function entitySubtitle(entityType: string, row: any): string {
  switch (entityType) {
    case 'ASET':
      return `${row?.branch_name || 'Cabang'} • ${row?.rab_number || 'RAB'}`;
    case 'RO':
      return [row?.ro_number, row?.branch_name].filter(Boolean).join(' • ');
    case 'SURAT_JALAN':
      return [row?.sj_number || row?.nomor_sj, row?.branch_name].filter(Boolean).join(' • ');
    case 'TRANSFER':
      return `${row?.transfer_number || 'Transfer'} • ${row?.from_location || '-'} → ${row?.to_location || '-'}`;
    case 'OUTLET':
      return [row?.branch_name || row?.nama, row?.region].filter(Boolean).join(' • ');
    case 'DISPOSISI':
      return [row?.disposition_number || row?.kode_aset, row?.outlet_nama].filter(Boolean).join(' • ');
    case 'PENGGUNA':
      return [row?.email, row?.role].filter(Boolean).join(' • ');
    default:
      return '';
  }
}

/**
 * Untuk Surat Jalan & Transfer, simpan kedua baris yang berbagi ID yang sama
 * agar pemulihan dari Tempat Sampah tidak meninggalkan data setengah jadi.
 */
async function buildTrashSnapshot(entityType: string, entityId: string, row: any): Promise<any> {
  if (entityType !== 'SURAT_JALAN' && entityType !== 'TRANSFER') return row;

  const admin = getAdminClient();
  if (!admin) return row;

  try {
    const [{ data: sj }, { data: transfer }] = await Promise.all([
      admin.from('surat_jalan').select('*').eq('id', entityId).maybeSingle(),
      admin.from('asset_transfers').select('*').eq('id', entityId).maybeSingle(),
    ]);

    const bundle: Record<string, any> = {};
    if (sj) bundle.surat_jalan = sj;
    if (transfer) bundle.asset_transfers = transfer;
    if (Object.keys(bundle).length > 0) return { __audit_bundle: bundle };
  } catch (err) {
    console.warn('[audit] Gagal membuat snapshot Surat Jalan/Transfer:', err);
  }

  return row;
}

/**
 * Hapus data terkait sebuah log CREATE / RESTORE.
 * Snapshot data diambil lebih dulu, lalu baris aktif dihapus. Setelah itu
 * snapshot dipindahkan ke Tempat Sampah supaya masih bisa dipulihkan.
 */
export async function deleteAuditEntity(
  log: AuditLogEntry,
  actorName: string,
  actorRole: string
): Promise<{ success: boolean; message: string }> {
  const table = AUDIT_ENTITY_TABLES[log.entity_type];
  if (!log.entity_id || !table) {
    return {
      success: false,
      message: 'Log ini tidak menyimpan ID data yang bisa dihapus.',
    };
  }

  const admin = getAdminClient();
  if (!admin) {
    return { success: false, message: 'Koneksi Supabase tidak tersedia.' };
  }

  try {
    const { data: row, error } = await admin
      .from(table)
      .select('*')
      .eq('id', log.entity_id)
      .maybeSingle();

    if (error) {
      return { success: false, message: `Gagal membaca data ${log.entity_type}: ${error.message}` };
    }

    // Data sudah tidak ada (mis. dihapus lewat modul lain) — anggap selesai.
    if (!row) {
      return {
        success: true,
        message: 'Data terkait sudah tidak ada di sistem.',
      };
    }

    // Snapshot diambil sebelum data dihapus, termasuk pasangan Surat Jalan ↔
    // Transfer Aset yang berbagi ID.
    const snapshot = await buildTrashSnapshot(log.entity_type, log.entity_id, row);

    // Hapus dari tabel aktif lebih dulu. Kalau penghapusan gagal, jangan buat
    // item Tempat Sampah supaya tidak ada data ganda (aktif + sampah).
    if (log.entity_type === 'SURAT_JALAN') {
      const ok = await deleteSuratJalan(log.entity_id);
      if (!ok) {
        return { success: false, message: 'Gagal menghapus Surat Jalan dari tabel aktif.' };
      }
    } else if (log.entity_type === 'TRANSFER') {
      const res = await deleteAssetTransfer(log.entity_id);
      if (!res.success) {
        return { success: false, message: 'Gagal menghapus Transfer Aset dari tabel aktif.' };
      }
    } else if (log.entity_type === 'PENGGUNA') {
      const ok = await deleteUserProfile(log.entity_id);
      if (!ok) {
        return { success: false, message: 'Gagal menghapus data pengguna.' };
      }
    } else if (log.entity_type === 'RO') {
      // Pakai nomor RO bila ada supaya tombstone sync memakai kunci yang benar.
      const roKey = (row as any)?.ro_number || log.entity_id;
      await deleteRequestOrder(roKey, actorName);
    } else {
      const { error: deleteError } = await admin.from(table).delete().eq('id', log.entity_id);
      if (deleteError) {
        return {
          success: false,
          message: `Gagal menghapus data ${log.entity_type}: ${deleteError.message}`,
        };
      }
    }

    // Beberapa fungsi hapus modul menelan error database. Verifikasi ulang agar
    // item sampah tidak dibuat untuk data yang sebenarnya masih aktif.
    const { data: leftover, error: verifyError } = await admin
      .from(table)
      .select('id')
      .eq('id', log.entity_id)
      .maybeSingle();

    if (verifyError) {
      return {
        success: false,
        message: `Gagal memverifikasi penghapusan ${log.entity_type}: ${verifyError.message}`,
      };
    }

    if (leftover) {
      return {
        success: false,
        message: `Data ${log.entity_type} masih ada di tabel aktif, penghapusan dibatalkan.`,
      };
    }

    await moveItemToTrash(
      log.entity_type as TrashEntityType,
      log.entity_id,
      log.entity_title || 'Data audit',
      entitySubtitle(log.entity_type, row),
      snapshot,
      actorName,
      actorRole,
      `Dihapus dari Audit Log #${log.id.slice(-6)}`
    );

    return {
      success: true,
      message: `Data "${log.entity_title}" dipindahkan ke Tempat Sampah dan masih bisa dipulihkan.`,
    };
  } catch (err: any) {
    console.error('[audit] Gagal menghapus data dari log:', err);
    return { success: false, message: `Gagal menghapus data terkait: ${err?.message || err}` };
  }
}

/**
 * Pulihkan data yang dihapus ke Tempat Sampah berdasarkan log DELETE_TO_TRASH.
 */
export async function restoreDeletedEntity(
  log: AuditLogEntry,
  actorName: string,
  actorRole: string
): Promise<{ success: boolean; message: string }> {
  if (!log.entity_id) {
    return { success: false, message: 'Log ini tidak menyimpan ID data yang bisa dipulihkan.' };
  }

  const trash = await getTrashItems();
  const item = trash.find(
    (entry) => entry.entity_id === log.entity_id && entry.entity_type === log.entity_type
  );

  if (!item) {
    return {
      success: false,
      message: 'Data tidak ditemukan di Tempat Sampah (mungkin sudah dipulihkan atau dimusnahkan).',
    };
  }

  const result = await restoreItemFromTrash(item.id, actorName, actorRole);
  if (!result.success) {
    return { success: false, message: result.error || 'Gagal memulihkan data.' };
  }

  return {
    success: true,
    message: `Data "${item.title}" berhasil dipulihkan ke sistem aktif.`,
  };
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

  const item = itemToRestore;
  const admin = getAdminClient();
  if (!admin) {
    return { success: false, error: 'Koneksi Supabase tidak tersedia.' };
  }

  const original = item.original_data;
  if (!original || typeof original !== 'object') {
    return { success: false, error: 'Data asli item tidak tersimpan, tidak bisa dipulihkan.' };
  }

  // 1. Kembalikan ke tabel aktif lebih dulu. Kalau gagal, item tetap di
  //    Tempat Sampah supaya tidak hilang dari daftar pemulihan.
  try {
    const bundle = (original as any).__audit_bundle;
    if (bundle && typeof bundle === 'object') {
      for (const [table, row] of Object.entries(bundle)) {
        if (!row || typeof row !== 'object') continue;
        const { error } = await admin.from(table).upsert([row as any]);
        if (error) {
          return { success: false, error: `Gagal memulihkan data ke tabel ${table}: ${error.message}` };
        }
      }
    } else {
      const table = AUDIT_ENTITY_TABLES[item.entity_type];
      if (!table || !(original as any).id) {
        return {
          success: false,
          error: `Pemulihan otomatis belum didukung untuk modul ${item.entity_type}.`,
        };
      }

      const { error } = await admin.from(table).upsert([original]);
      if (error) {
        return { success: false, error: `Gagal memulihkan data ${item.entity_type}: ${error.message}` };
      }
    }
  } catch (err: any) {
    console.warn('[restoreItemFromTrash] Failed restoring to Supabase:', err);
    return { success: false, error: `Gagal memulihkan data: ${err?.message || err}` };
  }

  // 2. Baru hapus dari Tempat Sampah setelah data aktif berhasil dibuat.
  try {
    await admin.from('trash_items').delete().eq('id', trashId);
  } catch (err) {
    console.warn('Gagal menghapus dari trash_items di Supabase', err);
  }

  if (fromMemory) {
    const memoryIndex = auditStore.trash.findIndex((t) => t.id === trashId);
    if (memoryIndex !== -1) auditStore.trash.splice(memoryIndex, 1);
  }

  // 3. RO yang dipulihkan harus dilepas dari tombstone sync agar tidak
  //    langsung terhapus lagi oleh sinkronisasi Google Sheets berikutnya.
  if (item.entity_type === 'RO') {
    await removeTombstonesByKeys(admin, [
      (original as any).ro_number,
      (original as any).raw_ro_id,
    ]);
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
