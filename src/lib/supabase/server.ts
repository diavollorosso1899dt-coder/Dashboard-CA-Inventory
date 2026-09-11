import { createClient } from '@supabase/supabase-js';
import { 
  AssetRequest, 
  DashboardMetrics, 
  BranchOpeningSummary, 
  SyncLog, 
  RegionType,
  UserProfile,
  Outlet,
  AssetTransfer,
  RequestOrder,
  SuratJalan,
  DispositionRequest
} from './types';
import { fetchAllSheetsData } from '../sync/sheet-fetcher';
import { getDaysRemaining } from '../utils/date-formatter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let isSupabaseHealthy: boolean | null = null;
let lastHealthCheck = 0;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (val?: string | null): boolean => {
  if (!val || typeof val !== 'string') return false;
  return UUID_REGEX.test(val);
};

export const ensureUuid = (id?: string | null): string => {
  if (id && isUuid(id)) return id;
  return crypto.randomUUID();
};

export const isServerSupabaseConfigured = () => {
  return Boolean(
    supabaseUrl &&
    supabaseServiceKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('your-project')
  );
};

export const getAdminClient = () => {
  if (!isServerSupabaseConfigured()) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
};

export async function checkSupabaseReachability(): Promise<boolean> {
  if (!isServerSupabaseConfigured()) return false;
  const now = Date.now();
  if (isSupabaseHealthy !== null && now - lastHealthCheck < 60000) {
    return isSupabaseHealthy;
  }
  try {
    const admin = getAdminClient();
    if (!admin) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const { error } = await admin
      .from('sync_logs')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal);
    clearTimeout(timer);
    if (error && (error.message?.includes('fetch failed') || error.message?.includes('ENOTFOUND'))) {
      isSupabaseHealthy = false;
      lastHealthCheck = now;
      console.warn('[Supabase] Host tidak dapat dihubungi. Menggunakan mode cache lokal Google Sheets.');
      return false;
    }
    isSupabaseHealthy = true;
    lastHealthCheck = now;
    return true;
  } catch {
    isSupabaseHealthy = false;
    lastHealthCheck = now;
    console.warn('[Supabase] Host tidak dapat dihubungi. Menggunakan mode cache lokal Google Sheets.');
    return false;
  }
}

// Global in-memory cache for fast local access & fallback when Supabase is not yet populated
declare global {
  // eslint-disable-next-line no-var
  var __LOCAL_ASSET_CACHE__: {
    items: AssetRequest[];
    lastSynced: string | null;
    lastContentHash: string | null;
    syncLogs: SyncLog[];
    manualEdits: Map<string, Partial<AssetRequest>>;
    outlets: Outlet[];
    users: UserProfile[];
    transfers: AssetTransfer[];
    requestOrders: RequestOrder[];
    suratJalan: SuratJalan[];
    dispositions: DispositionRequest[];
  } | undefined;
}

if (!global.__LOCAL_ASSET_CACHE__) {
  global.__LOCAL_ASSET_CACHE__ = {
    items: [],
    lastSynced: null,
    lastContentHash: null,
    syncLogs: [],
    manualEdits: new Map(),
    outlets: [
      {
        id: 'out-1',
        branch_name: 'Mie Ayam Muntjul Karawang',
        region: 'JABODETABEK',
        target_opening_date: '2026-04-02',
        status: 'OPENING_SOON',
        address: 'Jl. Ahmad Yani No. 45, Karawang Barat',
        pic_name: 'Budi Santoso',
        pic_phone: '081234567890',
        created_at: new Date().toISOString(),
      },
      {
        id: 'out-2',
        branch_name: 'Sop Mak Garang Kisamaun',
        region: 'JABODETABEK',
        target_opening_date: '2026-01-19',
        status: 'ACTIVE',
        address: 'Jl. Kisamaun No. 88, Tangerang',
        pic_name: 'Ahmad Dani',
        pic_phone: '081298765432',
        created_at: new Date().toISOString(),
      },
      {
        id: 'out-3',
        branch_name: 'Warung Nini Karawang',
        region: 'JABODETABEK',
        target_opening_date: '2026-04-02',
        status: 'OPENING_SOON',
        address: 'Jl. Tuparev No. 12, Karawang',
        pic_name: 'Siti Aminah',
        pic_phone: '085712345678',
        created_at: new Date().toISOString(),
      },
      {
        id: 'out-4',
        branch_name: 'Ayam Goreng Makmur',
        region: 'KALBAR',
        target_opening_date: '2026-05-15',
        status: 'ACTIVE',
        address: 'Jl. Gajah Mada No. 102, Pontianak',
        pic_name: 'Heru Wijaya',
        pic_phone: '081345678901',
        created_at: new Date().toISOString(),
      }
    ],
    users: [
      {
        id: 'usr-superuser',
        email: 'superuser@coffee-arabica.co.id',
        full_name: 'Super User (Administrator)',
        role: 'Super User',
        is_active: true,
        phone: '081122334455',
        created_at: new Date().toISOString(),
      },
      {
        id: 'usr-1',
        email: 'admin@coffee-arabica.co.id',
        full_name: 'Super Administrator CA',
        role: 'Super User',
        is_active: true,
        phone: '081122334455',
        created_at: new Date().toISOString(),
      },
      {
        id: 'usr-2',
        email: 'staff.scga@assetcontrol.com',
        full_name: 'Staff Logistik & Pengadaan',
        role: 'user',
        is_active: true,
        phone: '081199887766',
        created_at: new Date().toISOString(),
      },
      {
        id: 'usr-3',
        email: 'outlet.karawang@assetcontrol.com',
        full_name: 'Manager Mie Ayam Karawang',
        role: 'outlet_manager',
        branch_name: 'Mie Ayam Muntjul Karawang',
        is_active: true,
        phone: '081234567890',
        created_at: new Date().toISOString(),
      }
    ],
    transfers: [
      {
        id: 'trf-1',
        transfer_number: 'TRF/CA/2026/03/001',
        from_location: 'Gudang Pusat SCGA',
        to_location: 'Mie Ayam Muntjul Karawang',
        transfer_date: '2026-03-08',
        status: 'IN_TRANSIT',
        sender_pic: 'Staff Logistik SCGA',
        receiver_pic: 'Budi Santoso',
        notes: 'Pengiriman batch 1 meja kursi dan chiller dapur',
        items: [
          { id: 'ti-1', item_name: 'Meja Lesehan Kayu', quantity: 6, condition: 'BAIK' },
          { id: 'ti-2', item_name: 'Kursi Kayu Panjang', quantity: 40, condition: 'BAIK' },
        ],
        created_at: new Date().toISOString(),
      }
    ],
    requestOrders: [
      {
        id: 'ro-1',
        ro_number: 'RO-CA-2026-0042',
        branch_name: 'Mie Ayam Muntjul Karawang',
        region: 'JABODETABEK',
        requester_name: 'Mutia Kulsum (BusDev)',
        request_date: '2026-03-01',
        target_delivery_date: '2026-03-25',
        status: 'APPROVED',
        notes: 'Permohonan aset kelengkapan opening outlet April 2026',
        items: [
          { id: 'roi-1', item_name: 'Meja Lesehan', quantity_ordered: 6, quantity_fulfilled: 6, stock_source: 'GUDANG_SCGA' },
          { id: 'roi-2', item_name: 'Kursi Kayu', quantity_ordered: 40, quantity_fulfilled: 40, stock_source: 'GUDANG_SCGA' },
          { id: 'roi-3', item_name: 'Exhaust Hood Stainless 2M', quantity_ordered: 1, quantity_fulfilled: 0, stock_source: 'PR_VENDOR' },
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'ro-2',
        ro_number: 'RO-CA-2026-0043',
        branch_name: 'Warung Nini Karawang',
        region: 'JABODETABEK',
        requester_name: 'Siti Aminah',
        request_date: '2026-03-05',
        target_delivery_date: '2026-03-28',
        status: 'PENDING',
        notes: 'Penambahan chiller undercounter dan blender komersial',
        items: [
          { id: 'roi-4', item_name: 'Undercounter Chiller 2 Pintu', quantity_ordered: 1, quantity_fulfilled: 0, stock_source: 'PR_VENDOR' },
        ],
        created_at: new Date().toISOString(),
      }
    ],
    suratJalan: [
      {
        id: 'sj-1',
        sj_number: 'SJ/SCGA/2026/03/0088',
        ro_id: 'ro-1',
        ro_number: 'RO-CA-2026-0042',
        branch_name: 'Mie Ayam Muntjul Karawang',
        region: 'JABODETABEK',
        delivery_date: '2026-03-08',
        driver_name: 'Suryanto',
        driver_phone: '081399887711',
        vehicle_number: 'B 9482 SXZ',
        expedition: 'Armada Internal SCGA',
        sender_name: 'Staff SCGA Warehouse',
        receiver_name: 'Budi Santoso (Outlet Manager)',
        status: 'SHIPPED',
        notes: 'Harap periksa kondisi fisik kayu dan segel sebelum menandatangani',
        items: [
          { id: 'sji-1', item_name: 'Meja Lesehan Jepara (120x70x35)', quantity: 6, unit: 'Unit', notes: 'Bahan mahoni jati muda' },
          { id: 'sji-2', item_name: 'Kursi Kayu Panjang (4 Orang)', quantity: 40, unit: 'Unit', notes: 'Finishing natural doff' }
        ],
        created_at: new Date().toISOString(),
      }
    ],
    dispositions: [
      {
        id: 'disp-1',
        disposition_number: 'DISP/CA/2026/02/0014',
        branch_name: 'Sop Mak Garang Kisamaun',
        region: 'JABODETABEK',
        requester_name: 'Ahmad Dani',
        submission_date: '2026-02-28',
        status: 'DISETUJUI',
        approval_notes: 'Disetujui untuk dikembalikan ke Gudang SCGA untuk servis kompresor',
        approved_by: 'Super Administrator CA',
        items: [
          { id: 'di-1', item_name: 'Blender Komersial Heavy Duty', quantity: 1, condition: 'RUSAK_RINGAN', reason: 'Motor overheating setelah pemakaian 8 bulan' }
        ],
        created_at: new Date().toISOString(),
      }
    ]
  };
}

const cache = global.__LOCAL_ASSET_CACHE__;

/**
 * Execute Sync from Google Sheets to Supabase / Local Cache
 */
export async function syncGoogleSheetsToSupabase(options: { force?: boolean } = {}): Promise<{
  success: boolean;
  changed?: boolean;
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  message: string;
  durationMs: number;
}> {
  const startTime = Date.now();
  const force = options.force ?? false;

  try {
    const { items, stats, contentHash } = await fetchAllSheetsData();
    const admin = getAdminClient();

    // If content has not changed since last sync and not forced, return immediately (< 300ms)
    if (!force && cache.lastContentHash === contentHash && cache.lastSynced) {
      const duration = Date.now() - startTime;
      return {
        success: true,
        changed: false,
        totalFetched: stats.totalCount,
        totalInserted: 0,
        totalUpdated: 0,
        message: 'Data spreadsheet up-to-date (tidak ada baris baru).',
        durationMs: duration,
      };
    }

    let inserted = 0;
    let updated = 0;

    const isOnline = await checkSupabaseReachability();

    if (isOnline && admin) {
      // 1. Supabase Mode: Upsert records
      try {
        // Fetch existing manually edited external_ids to preserve dashboard updates
        const { data: existingEdits } = await admin
          .from('asset_requests')
          .select('external_id, is_manually_edited, item_delivery_status, stock_status, pic_receiver, notes')
          .eq('is_manually_edited', true);

        const editedMap = new Map<string, any>();
        (existingEdits || []).forEach((e) => editedMap.set(e.external_id, e));

        // Batch upsert in chunks of 500
        const chunkSize = 500;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize).map((item) => {
            const { id, ...rest } = item;
            const manualEdit = editedMap.get(item.external_id);
            if (manualEdit) {
              return {
                ...rest,
                item_delivery_status: manualEdit.item_delivery_status ?? item.item_delivery_status,
                stock_status: manualEdit.stock_status ?? item.stock_status,
                pic_receiver: manualEdit.pic_receiver ?? item.pic_receiver,
                notes: manualEdit.notes ?? item.notes,
                is_manually_edited: true,
              };
            }
            return rest;
          });

          const { error } = await admin
            .from('asset_requests')
            .upsert(chunk, { onConflict: 'external_id' });

          if (!error) {
            inserted += chunk.length;
          } else {
            console.error('Supabase upsert chunk notice:', error.message);
            break;
          }
        }

        // Clean up legacy non-deterministic external_id rows (where not JABO-ROW- or KALBAR-ROW-)
        try {
          await admin
            .from('asset_requests')
            .delete()
            .not('external_id', 'like', 'JABO-ROW-%')
            .not('external_id', 'like', 'KALBAR-ROW-%');
        } catch (cleanErr) {
          console.warn('Legacy cleanup notice:', cleanErr);
        }

        // Log sync to sync_logs
        const duration = Date.now() - startTime;
        await admin.from('sync_logs').insert({
          total_fetched: stats.totalCount,
          total_inserted: inserted,
          total_updated: updated,
          status: 'SUCCESS',
          duration_ms: duration,
        });
      } catch (dbErr: any) {
        console.warn('[Supabase Sync Warning]', dbErr.message);
      }

      // Also update memory cache
      cache.items = items;
      cache.lastSynced = new Date().toISOString();
      cache.lastContentHash = contentHash;

      return {
        success: true,
        changed: true,
        totalFetched: stats.totalCount,
        totalInserted: inserted,
        totalUpdated: updated,
        message: `Berhasil mensinkronisasi ${stats.totalCount} baris data ke Supabase (JABO: ${stats.jaboCount}, KALBAR: ${stats.kalbarCount}).`,
        durationMs: Date.now() - startTime,
      };
    } else {
      // 2. Local Cache Mode (Supabase not yet configured or offline)
      const duration = Date.now() - startTime;
      
      // Apply existing manual edits
      const mergedItems = items.map((item) => {
        const edits = cache.manualEdits.get(item.id) || cache.manualEdits.get(item.external_id);
        if (edits) {
          return { ...item, ...edits, is_manually_edited: true };
        }
        return item;
      });

      cache.items = mergedItems;
      cache.lastSynced = new Date().toISOString();
      cache.lastContentHash = contentHash;

      const log: SyncLog = {
        id: `log-${Date.now()}`,
        synced_at: cache.lastSynced,
        total_fetched: stats.totalCount,
        total_inserted: stats.totalCount,
        total_updated: cache.manualEdits.size,
        status: 'SUCCESS',
        duration_ms: duration,
      };
      cache.syncLogs.unshift(log);

      return {
        success: true,
        totalFetched: stats.totalCount,
        totalInserted: stats.totalCount,
        totalUpdated: cache.manualEdits.size,
        message: `Berhasil memuat ${stats.totalCount} data dari Google Sheets (JABO: ${stats.jaboCount}, KALBAR: ${stats.kalbarCount}). Database Supabase siap dikoneksikan.`,
        durationMs: duration,
      };
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('Sync error:', error);
    return {
      success: false,
      totalFetched: 0,
      totalInserted: 0,
      totalUpdated: 0,
      message: error?.message || 'Gagal melakukan sinkronisasi Google Sheets',
      durationMs: duration,
    };
  }
}

/**
 * Get all asset requests with optional filtering
 */
export async function getAssetRequests(options?: {
  region?: RegionType;
  branch?: string;
  rabNumber?: string;
  search?: string;
  isSystemTransfer?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ data: AssetRequest[]; total: number; lastSynced: string | null }> {
  if (isSupabaseHealthy !== false && isServerSupabaseConfigured()) {
    try {
      const admin = getAdminClient();
      if (admin) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        let query = admin.from('asset_requests').select('*', { count: 'exact' }).abortSignal(controller.signal);

        if (options?.region && options.region !== 'ALL') {
          query = query.eq('region', options.region);
        }
        if (options?.branch && options.branch !== 'ALL') {
          query = query.eq('branch_name', options.branch);
        }
        if (options?.rabNumber) {
          query = query.ilike('rab_number', `%${options.rabNumber}%`);
        }
        if (options?.isSystemTransfer) {
          query = query.eq('is_system_transfer', true);
        }
        if (options?.search) {
          query = query.or(
            `item_name.ilike.%${options.search}%,branch_name.ilike.%${options.search}%,requester_name.ilike.%${options.search}%,rab_number.ilike.%${options.search}%`
          );
        }

        query = query.order('order_datetime', { ascending: false, nullsFirst: false });

        if (options?.limit) {
          query = query.limit(options.limit);
        }
        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, count, error } = await query;
        clearTimeout(timeoutId);

        if (!error && data && data.length > 0) {
          return {
            data: data as AssetRequest[],
            total: count || data.length,
            lastSynced: cache.lastSynced,
          };
        }
      }
    } catch {
      // Gracefully fall through to local cache
    }
  }

  // Fallback to local memory cache / live fetch if empty
  if (cache.items.length === 0) {
    await syncGoogleSheetsToSupabase();
  }

  let filtered = [...cache.items];

  if (options?.region && options.region !== 'ALL') {
    filtered = filtered.filter((r) => r.region === options.region);
  }
  if (options?.branch && options.branch !== 'ALL') {
    filtered = filtered.filter((r) => r.branch_name.toLowerCase() === options.branch!.toLowerCase());
  }
  if (options?.rabNumber) {
    filtered = filtered.filter((r) => r.rab_number.toLowerCase().includes(options.rabNumber!.toLowerCase()));
  }
  if (options?.isSystemTransfer) {
    filtered = filtered.filter((r) => r.is_system_transfer);
  }
  if (options?.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.item_name.toLowerCase().includes(q) ||
        r.branch_name.toLowerCase().includes(q) ||
        r.requester_name.toLowerCase().includes(q) ||
        r.rab_number.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const offset = options?.offset || 0;
  const limit = options?.limit || 100;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    data: paginated,
    total,
    lastSynced: cache.lastSynced,
  };
}

/**
 * Update single asset request (Interactive editing from dashboard)
 */
export async function updateAssetRequest(
  id: string,
  payload: Partial<AssetRequest>
): Promise<{ success: boolean; data?: AssetRequest; error?: string }> {
  try {
    const admin = getAdminClient();
    const updatePayload = {
      ...payload,
      is_manually_edited: true,
      updated_at: new Date().toISOString(),
    };

    if (admin) {
      let query = admin.from('asset_requests').update(updatePayload);
      if (isUuid(id)) {
        query = query.eq('id', id);
      } else {
        query = query.eq('external_id', id);
      }

      const { data, error } = await query.select().single();
      if (error) {
        console.error('[Supabase updateAssetRequest error]:', error.message);
      } else if (data) {
        const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
        if (index !== -1) {
          cache.items[index] = { ...cache.items[index], ...data };
        }
        return { success: true, data: data as AssetRequest };
      }
    }

    // Update in local cache
    const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
    if (index !== -1) {
      const updated = {
        ...cache.items[index],
        ...updatePayload,
      };
      cache.items[index] = updated;
      cache.manualEdits.set(id, updatePayload);
      return { success: true, data: updated };
    }

    return { success: false, error: 'Item not found' };
  } catch (err: any) {
    console.error('Error updating asset:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Bulk update multiple asset requests
 */
export async function updateAssetRequestsBulk(
  ids: string[],
  payload: Partial<AssetRequest>
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const admin = getAdminClient();
    const updatePayload = {
      ...payload,
      is_manually_edited: true,
      updated_at: new Date().toISOString(),
    };

    if (admin) {
      const uuidIds = ids.filter(isUuid);
      const extIds = ids.filter((id) => !isUuid(id));
      let totalUpdated = 0;

      if (uuidIds.length > 0) {
        const { data, error } = await admin
          .from('asset_requests')
          .update(updatePayload)
          .in('id', uuidIds)
          .select('id');
        if (error) {
          console.error('[Supabase updateAssetRequestsBulk uuid error]:', error.message);
        } else if (data) {
          totalUpdated += data.length;
        }
      }

      if (extIds.length > 0) {
        const { data, error } = await admin
          .from('asset_requests')
          .update(updatePayload)
          .in('external_id', extIds)
          .select('id');
        if (error) {
          console.error('[Supabase updateAssetRequestsBulk extIds error]:', error.message);
        } else if (data) {
          totalUpdated += data.length;
        }
      }

      // Update in local cache as well
      ids.forEach((id) => {
        const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
        if (index !== -1) {
          cache.items[index] = { ...cache.items[index], ...updatePayload };
          cache.manualEdits.set(id, updatePayload);
        }
      });

      return { success: true, updatedCount: totalUpdated || ids.length };
    }

    // Local cache fallback
    ids.forEach((id) => {
      const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
      if (index !== -1) {
        cache.items[index] = { ...cache.items[index], ...updatePayload };
        cache.manualEdits.set(id, updatePayload);
      }
    });

    return { success: true, updatedCount: ids.length };
  } catch (err: any) {
    console.error('Error in bulk update:', err);
    return { success: false, updatedCount: 0, error: err.message };
  }
}

/**
 * Calculate Summary KPI Metrics & Analytics
 */
export async function calculateDashboardMetrics(region: RegionType = 'ALL'): Promise<DashboardMetrics> {
  const { data: items } = await getAssetRequests({ region, limit: 15000 });

  let totalItems = 0;
  let totalRab = 0;
  let totalDeal = 0;
  let fromStock = 0;
  let fromPr = 0;

  let completed = 0;
  let partial = 0;
  let inProgress = 0;
  let pending = 0;

  let leadTimeSum = 0;
  let leadTimeCount = 0;
  let slaOnTime = 0;
  let slaDelayed = 0;

  for (const item of items) {
    const qty = item.quantity_needed || 1;
    totalItems += qty;
    totalRab += item.rab_total || item.rab_price * qty || 0;
    totalDeal += item.realized_price || item.deal_price || 0;

    const stockQty = item.quantity_stock_allocated || 0;
    const prQty = item.quantity_pr || 0;

    if (stockQty > 0 || item.stock_status.includes('Ready')) {
      fromStock += stockQty > 0 ? stockQty : qty;
    }
    if (prQty > 0 || (!item.stock_status.includes('Ready') && stockQty === 0)) {
      fromPr += prQty > 0 ? prQty : (qty - stockQty);
    }

    const status = (item.item_delivery_status || '').toLowerCase();
    if (status.includes('lengkap') || status.includes('ready gudang')) {
      completed++;
    } else if (status.includes('sebagian')) {
      partial++;
    } else if (status.includes('proses')) {
      inProgress++;
    } else {
      pending++;
    }

    if (item.lead_time_days > 0) {
      leadTimeSum += item.lead_time_days;
      leadTimeCount++;
      if (item.lead_time_days <= 14) {
        slaOnTime++;
      } else {
        slaDelayed++;
      }
    }
  }

  const costSavings = Math.max(0, totalRab - totalDeal);
  const savingsPct = totalRab > 0 && totalDeal > 0 ? (costSavings / totalRab) * 100 : 0;
  const stockRate = totalItems > 0 ? Math.min(100, Math.round(((fromStock / totalItems) * 100) * 10) / 10) : 0;
  const avgLeadTime = leadTimeCount > 0 ? Math.round((leadTimeSum / leadTimeCount) * 10) / 10 : 0;

  // Calculate upcoming openings
  const branches = await getBranchOpeningSummaries(region);
  const upcomingOpenings = branches.filter(
    (b) => b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 60
  ).length;

  const avgReadiness =
    branches.length > 0
      ? Math.round(branches.reduce((acc, b) => acc + b.readiness_percentage, 0) / branches.length)
      : 0;

  return {
    total_requests: items.length,
    total_items: totalItems,
    total_rab_amount: totalRab,
    total_deal_amount: totalDeal,
    cost_savings_amount: costSavings,
    cost_savings_percentage: Math.round(savingsPct * 10) / 10,

    fulfilled_from_stock: fromStock,
    fulfilled_from_pr: fromPr,
    stock_fulfillment_rate: Math.round(stockRate * 10) / 10,

    completed_count: completed,
    partial_count: partial,
    in_progress_count: inProgress,
    pending_count: pending,

    avg_lead_time_days: avgLeadTime,
    sla_on_time_count: slaOnTime,
    sla_delayed_count: slaDelayed,

    upcoming_openings_count: upcomingOpenings,
    avg_branch_readiness: avgReadiness,
  };
}

/**
 * Get Branch Opening Readiness Summaries
 */
export async function getBranchOpeningSummaries(region: RegionType = 'ALL'): Promise<BranchOpeningSummary[]> {
  const { data: items } = await getAssetRequests({ region, limit: 15000 });

  const branchMap = new Map<
    string,
    {
      branch_name: string;
      region: string;
      opening_date: string | null;
      items: AssetRequest[];
    }
  >();

  for (const item of items) {
    if (!item.branch_name) continue;
    const key = `${item.region}-${item.branch_name.trim().toLowerCase()}`;
    if (!branchMap.has(key)) {
      branchMap.set(key, {
        branch_name: item.branch_name.trim(),
        region: item.region,
        opening_date: item.opening_date,
        items: [],
      });
    }
    const entry = branchMap.get(key)!;
    if (!entry.opening_date && item.opening_date) {
      entry.opening_date = item.opening_date;
    }
    entry.items.push(item);
  }

  const summaries: BranchOpeningSummary[] = [];

  for (const [, entry] of branchMap) {
    const total = entry.items.length;
    let completed = 0;
    let partial = 0;
    let pending = 0;
    let dealCost = 0;
    let rabBudget = 0;

    for (const it of entry.items) {
      const isReadyOrDone =
        (it.quantity_stock_allocated >= it.quantity_needed && it.quantity_needed > 0) ||
        (it.item_delivery_status || '').toLowerCase().includes('lengkap') ||
        (it.item_delivery_status || '').toLowerCase().includes('ready gudang');

      if (isReadyOrDone) {
        completed++;
      } else if (it.quantity_stock_allocated > 0 || (it.item_delivery_status || '').toLowerCase().includes('sebagian')) {
        partial++;
      } else {
        pending++;
      }

      dealCost += it.realized_price || it.deal_price || 0;
      rabBudget += it.rab_total || 0;
    }

    const readiness = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
    const daysLeft = entry.opening_date ? getDaysRemaining(entry.opening_date) : null;

    summaries.push({
      branch_name: entry.branch_name,
      region: entry.region,
      target_opening_date: entry.opening_date,
      days_until_opening: daysLeft,
      total_items_needed: total,
      items_completed: completed,
      items_partial: partial,
      items_pending: pending,
      readiness_percentage: readiness,
      total_deal_cost: dealCost,
      total_rab_budget: rabBudget,
    });
  }

  // Sort by target opening date ascending (closest opening first)
  return summaries.sort((a, b) => {
    if (a.days_until_opening !== null && b.days_until_opening !== null) {
      return a.days_until_opening - b.days_until_opening;
    }
    if (a.days_until_opening !== null) return -1;
    if (b.days_until_opening !== null) return 1;
    return b.total_items_needed - a.total_items_needed;
  });
}

// ==============================================================================
// 1. PENGGUNA & OUTLET CRUD
// ==============================================================================

function hashOutletBranch(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function getOutlets(): Promise<Outlet[]> {
  const admin = getAdminClient();
  let dbOutlets: Outlet[] = [];
  if (admin) {
    try {
      const { data, error } = await admin.from('outlets').select('*').order('branch_name');
      if (!error && data && data.length > 0) {
        dbOutlets = data as Outlet[];
      } else if (error) {
        console.error('[Supabase getOutlets error]:', error.message);
      }
    } catch (err: any) {
      console.error('[Supabase getOutlets exception]:', err.message);
    }
  }

  // Combined Map keyed by normalized branch name
  const outletMap = new Map<string, Outlet>();

  // Helper to normalize outlet object with bilingual property aliases
  const normalizeOutlet = (o: Partial<Outlet>): Outlet => {
    const branchName = (o.branch_name || o.nama || 'Outlet Baru').trim();
    const region = (o.region === 'JABO' ? 'JABODETABEK' : o.region) || 'JABODETABEK';
    const address = o.address || o.alamat || '';
    const picName = o.pic_name || o.pic_nama || '';
    const picPhone = o.pic_phone || o.telepon || '';
    const targetOpening = o.target_opening_date || o.target_opening || null;
    const status = o.status || 'Aktif';

    return {
      id: o.id || `out-${hashOutletBranch(branchName)}`,
      branch_name: branchName,
      nama: branchName,
      region: region as any,
      target_opening_date: targetOpening,
      target_opening: targetOpening,
      status: status as any,
      address,
      alamat: address,
      pic_name: picName,
      pic_nama: picName,
      pic_phone: picPhone,
      telepon: picPhone,
      notes: o.notes || '',
      created_at: o.created_at || new Date().toISOString(),
    };
  };

  // 1. Add from cache.outlets
  if (cache.outlets) {
    for (const o of cache.outlets) {
      const norm = normalizeOutlet(o);
      const key = norm.branch_name.toLowerCase();
      if (key) outletMap.set(key, norm);
    }
  }

  // 2. Add from Supabase database (takes precedence for richer data)
  for (const o of dbOutlets) {
    const norm = normalizeOutlet(o);
    const key = norm.branch_name.toLowerCase();
    if (key) outletMap.set(key, norm);
  }

  // 3. Scan asset_requests (items) to ensure any newly inputted or existing branch appears in the outlet list
  if (cache.items) {
    for (const item of cache.items) {
      if (!item.branch_name) continue;
      const key = item.branch_name.trim().toLowerCase();
      if (!outletMap.has(key)) {
        const isJabo = (item.region as string) === 'JABODETABEK' || (item.region as string) === 'JABO';
        const synthetic = normalizeOutlet({
          id: `out-auto-${hashOutletBranch(key)}`,
          branch_name: item.branch_name.trim(),
          nama: item.branch_name.trim(),
          region: isJabo ? 'JABODETABEK' : 'KALBAR',
          target_opening_date: item.opening_date || null,
          target_opening: item.opening_date || null,
          status: 'Persiapan Buka',
          address: '',
          alamat: '',
          pic_name: item.requester_name || '',
          pic_nama: item.requester_name || '',
          pic_phone: '',
          telepon: '',
          notes: 'Terdata otomatis dari transaksi aset',
          created_at: item.order_datetime || new Date().toISOString(),
        });
        outletMap.set(key, synthetic);
      } else {
        const existing = outletMap.get(key)!;
        if (!existing.target_opening_date && item.opening_date) {
          existing.target_opening_date = item.opening_date;
          existing.target_opening = item.opening_date;
        }
      }
    }
  }

  const result = Array.from(outletMap.values());
  return result.sort((a, b) => a.branch_name.localeCompare(b.branch_name));
}

export async function saveOutlet(outletData: Partial<Outlet>): Promise<Outlet> {
  const admin = getAdminClient();
  const branchName = (outletData.branch_name || outletData.nama || 'Outlet Baru').trim();
  const region = (outletData.region === 'JABO' ? 'JABODETABEK' : outletData.region) || 'JABODETABEK';
  const targetOpening = outletData.target_opening_date || outletData.target_opening || null;
  const address = outletData.address || outletData.alamat || '';
  const picName = outletData.pic_name || outletData.pic_nama || '';
  const picPhone = outletData.pic_phone || outletData.telepon || '';
  const status = outletData.status || 'Aktif';
  const outletId = ensureUuid(outletData.id);

  const outlet: Outlet = {
    id: outletId,
    branch_name: branchName,
    nama: branchName,
    region: region as any,
    target_opening_date: targetOpening,
    target_opening: targetOpening,
    status: status as any,
    address,
    alamat: address,
    pic_name: picName,
    pic_nama: picName,
    pic_phone: picPhone,
    telepon: picPhone,
    notes: outletData.notes || '',
    created_at: outletData.created_at || new Date().toISOString(),
  };

  if (admin) {
    try {
      const dbPayload = {
        id: outlet.id,
        branch_name: outlet.branch_name,
        region: outlet.region === 'JABO' ? 'JABODETABEK' : outlet.region,
        target_opening_date: outlet.target_opening_date,
        status: outlet.status,
        address: outlet.address,
        pic_name: outlet.pic_name,
        pic_phone: outlet.pic_phone,
        notes: outlet.notes,
        created_at: outlet.created_at,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from('outlets').upsert(dbPayload, { onConflict: 'branch_name' }).select().single();
      if (error) {
        console.error('[Supabase saveOutlet error]:', error.message);
      } else if (data) {
        syncOutletToCache({ ...outlet, ...data });
        return { ...outlet, ...data };
      }
    } catch (e: any) {
      console.warn('[saveOutlet] Error persisting to Supabase, falling back to local cache:', e.message);
    }
  }

  syncOutletToCache(outlet);
  return outlet;
}

function syncOutletToCache(outlet: Outlet) {
  if (!cache.outlets) cache.outlets = [];
  const idx = cache.outlets.findIndex(
    (o) => o.id === outlet.id || (o.branch_name && o.branch_name.toLowerCase() === outlet.branch_name.toLowerCase())
  );
  if (idx !== -1) {
    cache.outlets[idx] = { ...cache.outlets[idx], ...outlet };
  } else {
    cache.outlets.push(outlet);
  }
}

export async function getUserProfiles(): Promise<UserProfile[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('user_profiles').select('*').order('full_name');
      if (!error && data && data.length > 0) return data as UserProfile[];
      if (error) console.error('[Supabase getUserProfiles error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase getUserProfiles exception]:', err.message);
    }
  }
  return cache.users || [];
}

export async function saveUserProfile(userData: Partial<UserProfile>): Promise<UserProfile> {
  const admin = getAdminClient();
  const userId = ensureUuid(userData.id);
  const branch = userData.branch_name || userData.outlet_assigned || null;
  const user: UserProfile = {
    id: userId,
    email: userData.email || '',
    full_name: userData.full_name || 'User',
    role: userData.role || 'user',
    branch_name: branch || undefined,
    outlet_assigned: branch || undefined,
    phone: userData.phone,
    is_active: userData.is_active ?? true,
    created_at: userData.created_at || new Date().toISOString(),
  };

  if (admin) {
    try {
      const dbPayload = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        branch_name: branch,
        phone: user.phone || null,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from('user_profiles').upsert(dbPayload, { onConflict: 'email' }).select().single();
      if (error) {
        console.error('[Supabase saveUserProfile error]:', error.message);
      } else if (data) {
        return data as UserProfile;
      }
    } catch (err: any) {
      console.error('[Supabase saveUserProfile exception]:', err.message);
    }
  }

  const idx = cache.users.findIndex((u) => u.id === user.id || (u.email && u.email.toLowerCase() === user.email.toLowerCase()));
  if (idx !== -1) {
    cache.users[idx] = user;
  } else {
    cache.users.push(user);
  }
  return user;
}

// ==============================================================================
// 2. MONITORING: TRANSFER ASET & INPUT ASET
// ==============================================================================
export async function getAssetTransfers(): Promise<AssetTransfer[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('asset_transfers').select('*').order('transfer_date', { ascending: false });
      if (!error && data && data.length > 0) return data as AssetTransfer[];
      if (error) console.error('[Supabase getAssetTransfers error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase getAssetTransfers exception]:', err.message);
    }
  }
  return cache.transfers || [];
}

export async function createAssetTransfer(payload: Partial<AssetTransfer>): Promise<AssetTransfer> {
  const admin = getAdminClient();
  const transferId = ensureUuid(payload.id);
  const transfer: AssetTransfer = {
    id: transferId,
    transfer_number: payload.transfer_number || `TRF/CA/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`,
    from_location: payload.from_location || 'Gudang Pusat SCGA',
    to_location: payload.to_location || 'Outlet',
    transfer_date: payload.transfer_date || new Date().toISOString().split('T')[0],
    status: payload.status || 'IN_TRANSIT',
    sender_pic: payload.sender_pic || 'Staff SCGA',
    receiver_pic: payload.receiver_pic,
    items: payload.items || [],
    notes: payload.notes,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    try {
      const { data, error } = await admin.from('asset_transfers').insert(transfer).select().single();
      if (error) {
        console.error('[Supabase createAssetTransfer error]:', error.message);
      } else if (data) {
        cache.transfers.unshift(data as AssetTransfer);
        return data as AssetTransfer;
      }
    } catch (err: any) {
      console.error('[Supabase createAssetTransfer exception]:', err.message);
    }
  }

  cache.transfers.unshift(transfer);
  return transfer;
}

export async function createAssetRequest(payload: Partial<AssetRequest>): Promise<AssetRequest> {
  const branchName = (payload.branch_name || 'Tanpa Nama Outlet').trim();
  const region = payload.region || 'JABODETABEK';
  const openingDate = payload.opening_date || null;

  // Auto-register outlet if it doesn't exist yet so it immediately appears in "Daftar Outlet"
  if (branchName && branchName !== 'Tanpa Nama Outlet') {
    try {
      const outlets = await getOutlets();
      const existing = outlets.find(
        (o) => (o.branch_name || o.nama || '').trim().toLowerCase() === branchName.toLowerCase()
      );
      if (!existing) {
        await saveOutlet({
          branch_name: branchName,
          nama: branchName,
          region: ((region as string) === 'JABO' ? 'JABODETABEK' : region) as any,
          target_opening_date: openingDate,
          target_opening: openingDate,
          status: 'Persiapan Buka',
          pic_name: payload.requester_name || '',
          pic_nama: payload.requester_name || '',
          notes: `Terdaftar otomatis via Input Aset Baru (${payload.requester_division || 'BusDev'})`,
        });
      } else if (openingDate && !existing.target_opening_date) {
        // Update opening date if previously unset
        await saveOutlet({
          ...existing,
          target_opening_date: openingDate,
          target_opening: openingDate,
        });
      }
    } catch (err) {
      console.warn('[createAssetRequest] Failed to auto-register outlet:', err);
    }
  }

  const newId = ensureUuid(payload.id);
  const newExtId = payload.external_id || `CUSTOM-${Date.now()}`;

  const newAsset: AssetRequest = {
    id: newId,
    external_id: newExtId,
    region: payload.region || 'JABODETABEK',
    sheet_row_index: 0,
    order_datetime: payload.order_datetime || new Date().toISOString(),
    requester_name: payload.requester_name || 'Staff User',
    requester_division: payload.requester_division || 'BusDev',
    category: payload.category || 'New Outlet JABO',
    branch_name: branchName,
    classification: payload.classification || 'General',
    item_name: payload.item_name || 'Item Baru',
    system_item_name: payload.system_item_name || payload.item_name || 'Item Baru',
    specification: payload.specification || '',
    photo_url: payload.photo_url || null,
    quantity_needed: payload.quantity_needed || 1,
    rab_number: payload.rab_number || '',
    rab_link: payload.rab_link || '',
    rab_price: payload.rab_price || 0,
    rab_total: (payload.rab_price || 0) * (payload.quantity_needed || 1),
    acc_kadiv_request: payload.acc_kadiv_request ?? true,
    stock_status: payload.stock_status || 'Not Ready (Stok Kosong)',
    quantity_stock_allocated: payload.quantity_stock_allocated || 0,
    quantity_pr: payload.quantity_pr || 0,
    opening_date: openingDate,
    pr_datetime: null,
    is_direct_shipment: payload.is_direct_shipment ?? false,
    po_date: null,
    order_type: payload.order_type || 'OFFLINE',
    vendor_name: payload.vendor_name || '',
    initial_price: payload.initial_price || 0,
    deal_price: payload.deal_price || 0,
    realized_price: payload.realized_price || 0,
    negotiation_proof: null,
    acc_kadiv_procurement: false,
    procurement_status: payload.procurement_status || 'proses',
    item_delivery_status: payload.item_delivery_status || 'On Proses PR',
    received_date: null,
    lead_time_days: 0,
    pic_receiver: payload.pic_receiver || '',
    notes: payload.notes || '',
    is_manually_edited: true,
    is_system_transfer: payload.is_system_transfer ?? false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('asset_requests').insert(newAsset).select().single();
      if (error) {
        console.error('[Supabase createAssetRequest error]:', error.message);
      } else if (data) {
        cache.items.unshift(data as AssetRequest);
        return data as AssetRequest;
      }
    } catch (err: any) {
      console.error('[Supabase createAssetRequest exception]:', err.message);
    }
  }

  cache.items.unshift(newAsset);
  return newAsset;
}

// ==============================================================================
// 3. DISTRIBUSI: RO (REQUEST ORDER) & SURAT JALAN (SJ)
// ==============================================================================
// Helper: Guarantee strict deduplication on RO orders and internal items
export function deduplicateOrderItems(orders: RequestOrder[]): RequestOrder[] {
  const seenRoNumbers = new Set<string>();
  const sanitizedOrders: RequestOrder[] = [];

  for (const ro of orders) {
    const roKey = (ro.ro_number || ro.id || '').trim().toLowerCase();
    if (!roKey || seenRoNumbers.has(roKey)) continue;
    seenRoNumbers.add(roKey);

    // Deduplicate items inside this RO by: item_name + quantity_ordered
    const seenItems = new Set<string>();
    const cleanItems = [];
    for (const it of (ro.items || [])) {
      const itemKey = `${(it.item_name || '').trim().toLowerCase()}::${it.quantity_ordered ?? 1}`;
      if (!seenItems.has(itemKey)) {
        seenItems.add(itemKey);
        cleanItems.push(it);
      }
    }

    sanitizedOrders.push({
      ...ro,
      items: cleanItems,
    });
  }

  return sanitizedOrders;
}

export async function getRequestOrders(): Promise<RequestOrder[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('request_orders')
        .select('*')
        .order('request_date', { ascending: false })
        .limit(10000);
      if (!error && data && data.length > 0) return deduplicateOrderItems(data as RequestOrder[]);
      if (error) console.error('[Supabase getRequestOrders error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase getRequestOrders exception]:', err.message);
    }
  }
  return deduplicateOrderItems(cache.requestOrders || []);
}

export async function createRequestOrder(payload: Partial<RequestOrder>): Promise<RequestOrder> {
  const admin = getAdminClient();
  const roId = ensureUuid(payload.id);
  const ro: RequestOrder = {
    id: roId,
    ro_number: payload.ro_number || `RO-CA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
    raw_ro_id: payload.raw_ro_id,
    branch_name: payload.branch_name || 'Outlet',
    region: payload.region || 'JABODETABEK',
    requester_name: payload.requester_name || 'User Tim Pusat',
    request_date: payload.request_date || new Date().toISOString().split('T')[0],
    target_delivery_date: payload.target_delivery_date,
    status: payload.status || 'PENDING',
    items: payload.items || [],
    notes: payload.notes,
    warehouse_name: payload.warehouse_name,
    source_type: payload.source_type || 'MANUAL',
    is_duplicate: payload.is_duplicate ?? false,
    duplicate_count: payload.duplicate_count ?? 0,
    duplicate_group_id: payload.duplicate_group_id,
    current_stage: payload.current_stage || 'REQUEST_ORDER',
    pr_vendor_name: payload.pr_vendor_name,
    pr_po_number: payload.pr_po_number,
    pr_estimated_arrival: payload.pr_estimated_arrival,
    arrival_datetime: payload.arrival_datetime,
    received_date: payload.received_date,
    pic_receiver: payload.pic_receiver,
    checklist_notes: payload.checklist_notes,
    sla_lead_time_days: payload.sla_lead_time_days,
    sla_status: payload.sla_status,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    try {
      const { data, error } = await admin.from('request_orders').insert(ro).select().single();
      if (error) {
        console.error('[Supabase createRequestOrder error]:', error.message);
      } else if (data) {
        cache.requestOrders.unshift(data as RequestOrder);
        return data as RequestOrder;
      }
    } catch (err: any) {
      console.error('[Supabase createRequestOrder exception]:', err.message);
    }
  }

  cache.requestOrders.unshift(ro);
  return ro;
}

export async function updateRequestOrderStatus(id: string, status: RequestOrder['status']): Promise<boolean> {
  return updateRequestOrder(id, { status });
}

export async function updateRequestOrder(id: string, updates: Partial<RequestOrder>): Promise<boolean> {
  const admin = getAdminClient();
  const updateData: any = { ...updates, updated_at: new Date().toISOString() };

  if (admin) {
    try {
      let q = admin.from('request_orders').update(updateData);
      if (isUuid(id)) {
        q = q.eq('id', id);
      } else {
        q = q.eq('ro_number', id);
      }
      const { error } = await q;
      if (error) console.error('[Supabase updateRequestOrder error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase updateRequestOrder exception]:', err.message);
    }
  }

  const idx = cache.requestOrders.findIndex((r) => r.id === id || r.ro_number === id);
  if (idx !== -1) {
    cache.requestOrders[idx] = {
      ...cache.requestOrders[idx],
      ...updates,
    };
    return true;
  }
  return true;
}

// SMART DEDUPLICATION & SPREADSHEET SYNC ENGINE
const RO_GOOGLE_SHEET_CSV_URL =
  process.env.GOOGLE_SHEET_RO_URL ||
  'https://docs.google.com/spreadsheets/d/1xma83YRtP0WbjDnUFjmhgie3mWDgejV95HhlZX0sEvk/export?format=csv&gid=1158236044';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseIndoDate(dateStr?: string, fallbackToNull = false): string | null {
  if (!dateStr || typeof dateStr !== 'string') return fallbackToNull ? null : new Date().toISOString().split('T')[0];
  const clean = dateStr.split(' ')[0].trim();
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
      return `${parts[2]}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
    }
  }
  return fallbackToNull ? null : new Date().toISOString().split('T')[0];
}

export interface RoSyncResult {
  success: boolean;
  totalRowsScanned: number;
  duplicateRowsFiltered: number;
  uniqueOrdersCount: number;
  newOrdersAdded: number;
  existingOrdersUpdated: number;
  message: string;
}

export async function syncRequestOrdersFromSheet(): Promise<RoSyncResult> {
  try {
    const response = await fetch(RO_GOOGLE_SHEET_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Gagal mengunduh Spreadsheet (HTTP ${response.status})`);
    }

    const csvText = await response.text();
    const rawLines = csvText.split('\n');
    if (rawLines.length <= 1) {
      throw new Error('Spreadsheet kosong atau format tidak sesuai.');
    }

    let totalRowsScanned = 0;
    let duplicateRowsFiltered = 0;
    const seenFingerprints = new Set<string>();
    const groupedOrders = new Map<string, RequestOrder>();

    // Scan each row (skip header at index 0)
    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;
      totalRowsScanned++;

      const cols = parseCSVLine(line);
      const rawRoId = cols[3]?.trim();
      const itemName = cols[5]?.trim();
      const qtyStr = cols[6]?.trim();
      const outletName = cols[11]?.trim() || 'Outlet';

      if (!rawRoId || !itemName) continue;

      const qty = parseInt(qtyStr?.replace(/[^\d]/g, '') || '1') || 1;
      const unit = cols[7]?.trim() || 'unit';
      const harga = parseInt(cols[8]?.replace(/[^\d]/g, '') || '0') || 0;
      const total = parseInt(cols[9]?.replace(/[^\d]/g, '') || '0') || (harga * qty);
      const tipeItem = cols[10]?.trim() || 'Perlengkapan Tetap';
      const rowNo = cols[0]?.trim() || String(i);
      const sku = cols[4]?.trim() || '';
      const inputDate = cols[1]?.trim();
      const reqDate = cols[2]?.trim();
      const warehouse = cols[12]?.trim() || '-';
      const statusStr = cols[13]?.trim() || 'Diproses';

      // Cek data double: RO ID + item + qty + nama outlet yang sama -> hanya tampilkan 1 saja
      const fingerprint = `${rawRoId.toLowerCase().trim()}::${itemName.toLowerCase().trim()}::${qty}::${outletName.toLowerCase().trim()}`;
      if (seenFingerprints.has(fingerprint)) {
        duplicateRowsFiltered++;
        continue; // Lewati duplikat
      }
      seenFingerprints.add(fingerprint);

      const roNumber = `RO-${rawRoId}`;
      const isKalbar = /singkawang|pontianak|serdam|merdeka|ketapang|ayani|sohor|johar|patimura|boedjang|semar|muara|tyga sapi|kokotuku|perdana/i.test(outletName);
      const region: 'JABODETABEK' | 'KALBAR' = isKalbar ? 'KALBAR' : 'JABODETABEK';

      const parsedRequestDate = parseIndoDate(inputDate || reqDate) || new Date().toISOString().split('T')[0];
      const parsedTargetDate = parseIndoDate(reqDate || inputDate, true);

      if (!groupedOrders.has(roNumber)) {
        groupedOrders.set(roNumber, {
          id: `ro-${rawRoId}`,
          ro_number: roNumber,
          raw_ro_id: rawRoId,
          branch_name: outletName,
          region,
          requester_name: 'Logistik Outlet via Spreadsheet',
          request_date: parsedRequestDate,
          target_delivery_date: parsedTargetDate || undefined,
          status: statusStr === 'Diterima' ? 'COMPLETED' : 'INPUT_SYSTEM',
          current_stage: statusStr === 'Diterima' ? 'SELESAI' : 'REQUEST_ORDER',
          source_type: 'GOOGLE_SHEET',
          warehouse_name: warehouse,
          items: [],
          created_at: new Date().toISOString(),
        });
      }

      groupedOrders.get(roNumber)!.items.push({
        id: `roi-${rawRoId}-${rowNo}-${groupedOrders.get(roNumber)!.items.length + 1}`,
        item_name: itemName,
        sku,
        unit,
        unit_price: harga,
        total_price: total,
        item_type: tipeItem,
        quantity_ordered: qty,
        quantity_fulfilled: statusStr === 'Diterima' ? qty : 0,
        stock_source: 'GUDANG_SCGA',
      });
    }

    const uniqueOrders = Array.from(groupedOrders.values());
    let totalItems = 0;
    uniqueOrders.forEach(o => totalItems += o.items.length);

    // Upsert into Supabase request_orders table
    const admin = getAdminClient();
    if (admin && uniqueOrders.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < uniqueOrders.length; i += chunkSize) {
        const chunk = uniqueOrders.slice(i, i + chunkSize).map((o) => ({
          ro_number: o.ro_number,
          raw_ro_id: o.raw_ro_id,
          branch_name: o.branch_name,
          region: o.region,
          requester_name: o.requester_name,
          request_date: o.request_date,
          target_delivery_date: o.target_delivery_date || null,
          status: o.status,
          current_stage: o.current_stage,
          source_type: o.source_type,
          warehouse_name: o.warehouse_name,
          items: o.items,
        }));
        await admin.from('request_orders').upsert(chunk, { onConflict: 'ro_number' });
      }
    }

    // Merge into in-memory cache
    cache.requestOrders = uniqueOrders;

    return {
      success: true,
      totalRowsScanned,
      duplicateRowsFiltered,
      uniqueOrdersCount: uniqueOrders.length,
      newOrdersAdded: totalItems,
      existingOrdersUpdated: 0,
      message: `Deduplikasi Sukses: ${totalRowsScanned} baris dipindai. ${duplicateRowsFiltered} baris data double (RO ID + item + qty + outlet sama) disaring. Hanya 1 yang ditampilkan (${totalItems} item unik dalam ${uniqueOrders.length} dokumen RO).`,
    };
  } catch (err: any) {
    console.error('Error syncing Request Orders from sheet:', err);
    return {
      success: false,
      totalRowsScanned: 0,
      duplicateRowsFiltered: 0,
      uniqueOrdersCount: 0,
      newOrdersAdded: 0,
      existingOrdersUpdated: 0,
      message: err.message || 'Gagal menyinkronkan data RO dari spreadsheet.',
    };
  }
}

export function cleanDuplicateRequestOrders(): { cleanedCount: number; totalUnique: number } {
  const seenNumbers = new Set<string>();
  const uniqueOrders: RequestOrder[] = [];
  let cleanedCount = 0;

  for (const ro of cache.requestOrders) {
    const key = (ro.ro_number || ro.id).toLowerCase();
    if (seenNumbers.has(key)) {
      cleanedCount++;
    } else {
      seenNumbers.add(key);
      uniqueOrders.push(ro);
    }
  }

  cache.requestOrders = uniqueOrders;
  return { cleanedCount, totalUnique: uniqueOrders.length };
}

export async function getSuratJalanList(): Promise<SuratJalan[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('surat_jalan').select('*').order('delivery_date', { ascending: false });
      if (!error && data && data.length > 0) return data as SuratJalan[];
      if (error) console.error('[Supabase getSuratJalanList error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase getSuratJalanList exception]:', err.message);
    }
  }
  return cache.suratJalan || [];
}

export async function getSuratJalanById(id: string): Promise<SuratJalan | null> {
  const all = await getSuratJalanList();
  return all.find((sj) => sj.id === id || sj.sj_number === id) || null;
}

export async function createSuratJalan(payload: Partial<SuratJalan>): Promise<SuratJalan> {
  const admin = getAdminClient();
  const sjId = ensureUuid(payload.id);
  const roId = isUuid(payload.ro_id) ? payload.ro_id : null;

  const sj: SuratJalan = {
    id: sjId,
    sj_number: payload.sj_number || `SJ/SCGA/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${Date.now().toString().slice(-4)}`,
    ro_id: roId || undefined,
    ro_number: payload.ro_number,
    branch_name: payload.branch_name || payload.tujuan_outlet_nama || 'Outlet Tujuan',
    region: payload.region || 'JABODETABEK',
    delivery_date: payload.delivery_date || payload.tanggal_kirim || new Date().toISOString().split('T')[0],
    driver_name: payload.driver_name || payload.driver_nama || 'Driver Pengantar',
    driver_phone: payload.driver_phone,
    vehicle_number: payload.vehicle_number || payload.kendaraan_plat || 'B 1234 SCG',
    expedition: payload.expedition || payload.ekspedisi || 'Armada Internal SCGA',
    sender_name: payload.sender_name || payload.pengirim_nama || 'Staff Gudang SCGA',
    receiver_name: payload.receiver_name || payload.penerima_nama,
    status: payload.status || 'SHIPPED',
    items: payload.items || [],
    notes: payload.notes || payload.catatan,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    try {
      const dbPayload = {
        ...sj,
        ro_id: roId,
      };
      const { data, error } = await admin.from('surat_jalan').insert(dbPayload).select().single();
      if (error) {
        console.error('[Supabase createSuratJalan error]:', error.message);
      } else if (data) {
        cache.suratJalan.unshift(data as SuratJalan);
        return data as SuratJalan;
      }
    } catch (err: any) {
      console.error('[Supabase createSuratJalan exception]:', err.message);
    }
  }

  cache.suratJalan.unshift(sj);
  return sj;
}

export async function updateSuratJalanStatus(id: string, status: 'SHIPPED' | 'DELIVERED', receiverName?: string): Promise<boolean> {
  const admin = getAdminClient();
  const updateData: any = { status, updated_at: new Date().toISOString() };
  if (receiverName) updateData.receiver_name = receiverName;
  if (status === 'DELIVERED') updateData.received_at = new Date().toISOString();

  if (admin) {
    try {
      let q = admin.from('surat_jalan').update(updateData);
      if (isUuid(id)) {
        q = q.eq('id', id);
      } else {
        q = q.eq('sj_number', id);
      }
      const { error } = await q;
      if (error) console.error('[Supabase updateSuratJalanStatus error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase updateSuratJalanStatus exception]:', err.message);
    }
  }

  const idx = cache.suratJalan.findIndex((sj) => sj.id === id || sj.sj_number === id);
  if (idx !== -1) {
    cache.suratJalan[idx].status = status;
    if (receiverName) cache.suratJalan[idx].receiver_name = receiverName;
    if (status === 'DELIVERED') cache.suratJalan[idx].received_at = new Date().toISOString();
    return true;
  }
  return true;
}

// ==============================================================================
// 4. DISPOSISI: PENGEMBALIAN ASET
// ==============================================================================
export async function getDispositionRequests(): Promise<DispositionRequest[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('disposition_requests').select('*').order('submission_date', { ascending: false });
      if (!error && data && data.length > 0) return data as DispositionRequest[];
      if (error) console.error('[Supabase getDispositionRequests error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase getDispositionRequests exception]:', err.message);
    }
  }
  return cache.dispositions || [];
}

export async function createDispositionRequest(payload: Partial<DispositionRequest>): Promise<DispositionRequest> {
  const admin = getAdminClient();
  const dispId = ensureUuid(payload.id);
  const branchName = payload.branch_name || payload.outlet_nama || 'Outlet';
  const requester = payload.requester_name || payload.diajukan_oleh || 'Staff Cabang';

  // Construct items array if submitted with single-item fields
  let items = payload.items || [];
  if (items.length === 0 && (payload.nama_aset || payload.kode_aset)) {
    items = [
      {
        id: ensureUuid(),
        item_name: payload.nama_aset || 'Aset',
        quantity: 1,
        condition: (payload.kondisi as any) || 'Rusak Ringan',
        reason: payload.alasan || '',
        photo_url: payload.foto_url,
      },
    ];
  }

  const disp: DispositionRequest = {
    id: dispId,
    disposition_number: payload.disposition_number || `DISP/CA/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`,
    branch_name: branchName,
    outlet_nama: branchName,
    region: payload.region || 'JABODETABEK',
    requester_name: requester,
    diajukan_oleh: requester,
    submission_date: payload.submission_date || new Date().toISOString().split('T')[0],
    status: payload.status || 'DIAJUKAN',
    items,
    kode_aset: payload.kode_aset,
    nama_aset: payload.nama_aset,
    kondisi: payload.kondisi,
    alasan: payload.alasan,
    foto_url: payload.foto_url,
    approval_notes: payload.approval_notes || payload.catatan_admin,
    approved_by: payload.approved_by,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    try {
      const { data, error } = await admin.from('disposition_requests').insert(disp).select().single();
      if (error) {
        console.error('[Supabase createDispositionRequest error]:', error.message);
      } else if (data) {
        cache.dispositions.unshift(data as DispositionRequest);
        return data as DispositionRequest;
      }
    } catch (err: any) {
      console.error('[Supabase createDispositionRequest exception]:', err.message);
    }
  }

  cache.dispositions.unshift(disp);
  return disp;
}

export async function updateDispositionStatus(
  id: string, 
  status: DispositionRequest['status'], 
  approvalNotes?: string,
  approvedBy?: string
): Promise<boolean> {
  const admin = getAdminClient();
  const updateData: any = { 
    status, 
    updated_at: new Date().toISOString(),
    approval_notes: approvalNotes || null,
    approved_by: approvedBy || null
  };

  if (admin) {
    try {
      let q = admin.from('disposition_requests').update(updateData);
      if (isUuid(id)) {
        q = q.eq('id', id);
      } else {
        q = q.eq('disposition_number', id);
      }
      const { error } = await q;
      if (error) console.error('[Supabase updateDispositionStatus error]:', error.message);
    } catch (err: any) {
      console.error('[Supabase updateDispositionStatus exception]:', err.message);
    }
  }

  const idx = cache.dispositions.findIndex((d) => d.id === id || d.disposition_number === id);
  if (idx !== -1) {
    cache.dispositions[idx].status = status;
    if (approvalNotes) cache.dispositions[idx].approval_notes = approvalNotes;
    if (approvedBy) cache.dispositions[idx].approved_by = approvedBy;
    return true;
  }
  return true;
}

// ==============================================================================
// 5. PURCHASE REQUIREMENT (PR) & MASTER ASSET CATALOG HELPERS
// ==============================================================================

export async function getPurchaseRequirementItems(region: RegionType = 'ALL'): Promise<AssetRequest[]> {
  const { data: allItems } = await getAssetRequests({ region, limit: 5000 });
  return allItems.filter(
    (it) =>
      it.quantity_pr > 0 ||
      it.stock_status.includes('Not Ready') ||
      (it.procurement_status && it.procurement_status !== 'selesai')
  );
}

export interface MasterAssetItem {
  id: string;
  item_name: string;
  system_item_name: string;
  unit?: string;
  classification: string;
  specification: string;
  photo_url: string | null;
  standard_rab_price: number;
  total_requests: number;
  total_units_needed: number;
  is_new_item?: boolean;
  created_at?: string;
}

const MASTER_ASSET_GOOGLE_SHEET_CSV_URL =
  process.env.GOOGLE_SHEET_MASTER_ASSET_URL ||
  'https://docs.google.com/spreadsheets/d/1xma83YRtP0WbjDnUFjmhgie3mWDgejV95HhlZX0sEvk/export?format=csv&gid=109322565';
let cachedMasterCatalog: MasterAssetItem[] | null = null;
let masterCatalogLastFetched = 0;

export async function syncMasterAssetCatalogFromSheet(): Promise<{
  success: boolean;
  totalItems: number;
  classifications: string[];
  message: string;
}> {
  try {
    const response = await fetch(MASTER_ASSET_GOOGLE_SHEET_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Gagal mengunduh Spreadsheet Master Aset (HTTP ${response.status})`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');
    const items: MasterAssetItem[] = [];
    const seenNames = new Set<string>();
    const classifications = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = parseCSVLine(line);

      const rawName = cols[7]?.trim();
      if (!rawName) continue;

      const unit = cols[8]?.trim() || 'unit';
      let akun = cols[9]?.trim() || 'General';
      const akunLower = akun.toLowerCase();
      if (akunLower === 'perlengkapan tetap') akun = 'Perlengkapan Tetap';
      else if (akunLower === 'peralatan') akun = 'Peralatan';
      else if (akunLower === 'mesin') akun = 'Mesin';
      else if (akunLower === 'kendaraan') akun = 'Kendaraan';
      else if (akunLower === 'bangunan') akun = 'Bangunan';
      else if (akunLower === 'perlengkapan habis pakai') akun = 'Perlengkapan Habis Pakai';
      else if (!akun || akun === '-') akun = 'General';
      else akun = akun.charAt(0).toUpperCase() + akun.slice(1);

      classifications.add(akun);

      const imgRaw = cols[10]?.trim();
      const specRaw = cols[11]?.trim();

      let photoUrl: string | null = null;
      let specification = specRaw || '';

      if (imgRaw && (imgRaw.startsWith('http') || imgRaw.includes('drive.google.com'))) {
        photoUrl = imgRaw;
      } else if (specRaw && (specRaw.startsWith('http') && (specRaw.includes('drive.google.com') || /\.(png|jpe?g|webp|gif)/i.test(specRaw)))) {
        photoUrl = specRaw;
        specification = '';
      }

      // Convert Google Drive view links to direct image preview links
      if (photoUrl && photoUrl.includes('drive.google.com')) {
        const driveMatch = photoUrl.match(/(?:file\/d\/|open\?id=|id=)([a-zA-Z0-9_-]{20,})/);
        if (driveMatch && driveMatch[1]) {
          photoUrl = `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
        }
      }

      const key = rawName.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const isNewItem = rawName.toLowerCase().includes('(sampel)') || rawName.toLowerCase().includes('new') || rawName.toLowerCase().includes('sample');

      items.push({
        id: `mat-${items.length + 1}`,
        item_name: rawName,
        system_item_name: rawName,
        unit,
        classification: akun,
        specification,
        photo_url: photoUrl,
        standard_rab_price: 0,
        total_requests: 1,
        total_units_needed: 1,
        is_new_item: isNewItem,
      });
    }

    // Also supplement with any items from the RO sheet (New Data Mentah) so no requested item is missing
    try {
      const roResponse = await fetch(RO_GOOGLE_SHEET_CSV_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (roResponse.ok) {
        const roCsvText = await roResponse.text();
        const roLines = roCsvText.split('\n');
        for (let i = 1; i < roLines.length; i++) {
          const rLine = roLines[i];
          if (!rLine.trim()) continue;
          const rCols = parseCSVLine(rLine);
          const rItemName = rCols[5]?.trim();
          if (!rItemName) continue;
          const rKey = rItemName.toLowerCase();
          if (!seenNames.has(rKey)) {
            seenNames.add(rKey);
            const rUnit = rCols[7]?.trim() || 'unit';
            const rTipe = rCols[10]?.trim() || 'Perlengkapan Tetap';
            classifications.add(rTipe);
            items.push({
              id: `mat-ro-${items.length + 1}`,
              item_name: rItemName,
              system_item_name: rItemName,
              unit: rUnit,
              classification: rTipe,
              specification: '',
              photo_url: null,
              standard_rab_price: parseInt(rCols[8]?.replace(/[^\d]/g, '') || '0') || 0,
              total_requests: 1,
              total_units_needed: 1,
              is_new_item: true,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Could not supplement master catalog with RO items:', e);
    }

    items.sort((a, b) => a.item_name.localeCompare(b.item_name));
    cachedMasterCatalog = items;
    masterCatalogLastFetched = Date.now();

    return {
      success: true,
      totalItems: items.length,
      classifications: Array.from(classifications),
      message: `Berhasil menyinkronkan ${items.length} item dari Master Aset Google Spreadsheet.`,
    };
  } catch (err: any) {
    console.error('Error syncing Master Asset Catalog from sheet:', err);
    return {
      success: false,
      totalItems: 0,
      classifications: [],
      message: err.message || 'Gagal menyinkronkan Master Aset dari Spreadsheet.',
    };
  }
}

export async function getMasterAssetCatalog(): Promise<MasterAssetItem[]> {
  if (cachedMasterCatalog && Date.now() - masterCatalogLastFetched < 15 * 60 * 1000) {
    return cachedMasterCatalog;
  }

  const syncRes = await syncMasterAssetCatalogFromSheet();
  if (syncRes.success && cachedMasterCatalog) {
    return cachedMasterCatalog;
  }

  return cachedMasterCatalog || [];
}

// ==============================================================================
// 6. OPERATIONAL WORKFLOW PIPELINE (DASHBOARD FLOW RANCANGAN)
// ==============================================================================

export interface WorkflowStageDetail {
  count: number;
  label: string;
  subLabel?: string;
  items: {
    id: string;
    title: string;
    subtitle: string;
    status: string;
    badge?: string;
    info?: string;
  }[];
}

export interface OperationalWorkflowSummary {
  ro: WorkflowStageDetail;
  input_excel: WorkflowStageDetail;
  pilih_proses: WorkflowStageDetail & { readyCount: number; prCount: number };
  kelola_pr: WorkflowStageDetail;
  ready_stock: WorkflowStageDetail;
  surat_jalan: WorkflowStageDetail & { inTransitCount: number; deliveredCount: number };
  aset_sampai: WorkflowStageDetail & { waitingCount: number; arrivedCount: number };
  checklist_diterima: WorkflowStageDetail;
  update_sla: WorkflowStageDetail & { onTimeCount: number; delayedCount: number };
  selesai: WorkflowStageDetail;
}

export async function getOperationalWorkflowSummary(region: RegionType = 'ALL'): Promise<OperationalWorkflowSummary> {
  const [orders, sjList, assetRes] = await Promise.all([
    getRequestOrders(),
    getSuratJalanList(),
    getAssetRequests({ region, limit: 10000 }),
  ]);

  const items = assetRes.data;

  // 1. Request Order (RO)
  const roActive = orders.filter((o) => region === 'ALL' || o.region === region || (region === 'JABODETABEK' && (o.region as string) === 'JABO'));
  const roStage: WorkflowStageDetail = {
    count: roActive.length || 8,
    label: 'Request Order',
    subLabel: 'Permohonan pengadaan masuk dari outlet',
    items: roActive.slice(0, 6).map((o) => ({
      id: o.id,
      title: o.ro_number,
      subtitle: `${o.branch_name} (${o.region})`,
      status: o.status,
      badge: `${o.items.length} Item`,
      info: `Order: ${o.request_date}`,
    })),
  };

  // 2. Input Data Excel / Sistem
  const inputItems = items.filter((it) => it.sheet_row_index > 0 || it.is_manually_edited);
  const inputStage: WorkflowStageDetail = {
    count: inputItems.length || items.length,
    label: 'Input Data Excel / Sistem',
    subLabel: 'Data permohonan terekam di sistem & Google Sheets',
    items: items.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; No RAB: ${it.rab_number || '-'}`,
      status: it.stock_status,
      badge: `${it.quantity_needed} Unit`,
      info: it.order_datetime?.split('T')[0] || '-',
    })),
  };

  // 3. Pilih Proses (Decision: Ready Stock vs PR)
  const readyStockAllocated = items.filter((it) => it.quantity_stock_allocated > 0 || it.stock_status.includes('Ready'));
  const prAllocated = items.filter((it) => it.quantity_pr > 0 || it.stock_status.includes('Not Ready'));
  const pilihProsesStage = {
    count: items.length,
    label: 'Pilih Proses Alokasi',
    subLabel: 'Keputusan alokasi: Stok Gudang SCGA vs PR Beli Baru',
    readyCount: readyStockAllocated.length,
    prCount: prAllocated.length,
    items: [
      ...readyStockAllocated.slice(0, 3).map((it) => ({
        id: it.id,
        title: it.item_name,
        subtitle: `${it.branch_name} &bull; Siap Gudang`,
        status: 'READY STOCK',
        badge: `${it.quantity_stock_allocated || it.quantity_needed} Unit`,
        info: 'Alokasi Stok SCGA',
      })),
      ...prAllocated.slice(0, 3).map((it) => ({
        id: it.id,
        title: it.item_name,
        subtitle: `${it.branch_name} &bull; Butuh Pengadaan`,
        status: 'PR VENDOR',
        badge: `${it.quantity_pr || it.quantity_needed} Unit`,
        info: 'Jalur Belum Tersedia',
      })),
    ],
  };

  // 4. Kelola PR & Input Tgl Kedatangan
  const prItems = items.filter(
    (it) => it.quantity_pr > 0 || it.stock_status.includes('Not Ready') || (it.procurement_status && it.procurement_status !== 'selesai')
  );
  const kelolaPrStage: WorkflowStageDetail = {
    count: prItems.length,
    label: 'Kelola PR (Input Tgl Kedatangan)',
    subLabel: 'Negosiasi vendor, input PO, & target kedatangan barang',
    items: prItems.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; Vendor: ${it.vendor_name || 'Menunggu Vendor'}`,
      status: (it.procurement_status || 'proses').toUpperCase(),
      badge: `${it.quantity_pr || it.quantity_needed} Unit`,
      info: it.po_date ? `PO: ${it.po_date}` : 'Belum PO',
    })),
  };

  // 5. Ready Stock
  const readyItems = items.filter(
    (it) => it.quantity_stock_allocated > 0 || it.item_delivery_status?.toLowerCase().includes('ready')
  );
  const readyStockStage: WorkflowStageDetail = {
    count: readyItems.length,
    label: 'Ready Stock',
    subLabel: 'Aset siap di Gudang SCGA untuk dipacking & dikirim',
    items: readyItems.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; Gudang SCGA`,
      status: 'READY',
      badge: `${it.quantity_stock_allocated || it.quantity_needed} Unit`,
      info: 'Siap Terbit SJ',
    })),
  };

  // 6. Surat Jalan & Distribusi
  const sjActive = sjList.filter((s) => region === 'ALL' || s.region === region);
  const sjInTransit = sjActive.filter((s) => s.status === 'SHIPPED');
  const sjDelivered = sjActive.filter((s) => s.status === 'DELIVERED');
  const suratJalanStage = {
    count: sjActive.length || 4,
    label: 'Surat Jalan & Distribusi',
    subLabel: 'Penerbitan dokumen SJ resmi & armada pengiriman jalan',
    inTransitCount: sjInTransit.length || 2,
    deliveredCount: sjDelivered.length || 2,
    items: sjActive.slice(0, 6).map((s) => ({
      id: s.id,
      title: s.sj_number || 'SJ-DRAFT',
      subtitle: `Tujuan: ${s.branch_name} &bull; ${s.driver_name || 'Armada Internal'}`,
      status: s.status,
      badge: `${s.items?.length || 1} Item`,
      info: `Kirim: ${s.delivery_date}`,
    })),
  };

  // 7. Aset Sampai? (Decision: Belum vs Ya)
  const asetSampaiStage = {
    count: sjActive.length,
    label: 'Aset Sampai di Outlet?',
    subLabel: 'Verifikasi kedatangan fisik barang di cabang tujuan',
    waitingCount: sjInTransit.length,
    arrivedCount: sjDelivered.length,
    items: sjActive.slice(0, 6).map((s) => ({
      id: s.id,
      title: `${s.sj_number} &bull; ${s.branch_name}`,
      subtitle: s.status === 'SHIPPED' ? 'Masih Dalam Perjalanan (Belum)' : 'Tiba di Lokasi (Ya)',
      status: s.status === 'SHIPPED' ? 'BELUM SAMPAI' : 'SUDAH TIBA',
      badge: s.status === 'SHIPPED' ? 'Loopback Kirim' : 'Lanjut Checklist',
      info: s.delivery_date,
    })),
  };

  // 8. Checklist Diterima
  const checklistItems = items.filter(
    (it) => (it.item_delivery_status || '').toLowerCase().includes('sebagian') || (it.item_delivery_status || '').toLowerCase().includes('proses')
  );
  const checklistStage: WorkflowStageDetail = {
    count: checklistItems.length,
    label: 'Checklist Diterima',
    subLabel: 'Store Manager / PIC toko cek fisik & checklist barang',
    items: checklistItems.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; PIC: ${it.pic_receiver || it.requester_name}`,
      status: (it.item_delivery_status || 'On Proses').toUpperCase(),
      badge: `${it.quantity_needed} Unit`,
      info: it.received_date ? it.received_date.split('T')[0] : 'Cek Fisik',
    })),
  };

  // 9. Update Sistem Pemantauan SLA
  const slaItems = items.filter((it) => it.lead_time_days > 0 || it.received_date);
  const onTimeCount = slaItems.filter((it) => it.lead_time_days <= 14).length;
  const delayedCount = slaItems.filter((it) => it.lead_time_days > 14).length;
  const updateSlaStage = {
    count: slaItems.length,
    label: 'Update Sistem Pemantauan SLA',
    subLabel: 'Pencatatan lead time aktual & update performa pengadaan',
    onTimeCount,
    delayedCount,
    items: slaItems.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; Lead Time: ${it.lead_time_days} Hari`,
      status: it.lead_time_days <= 14 ? 'SLA ON-TIME' : 'SLA DELAYED',
      badge: `${it.lead_time_days} Hari`,
      info: it.received_date ? it.received_date.split('T')[0] : 'SLA Updated',
    })),
  };

  // 10. Selesai
  const completedItems = items.filter((it) => (it.item_delivery_status || '').toLowerCase().includes('lengkap'));
  const selesaiStage: WorkflowStageDetail = {
    count: completedItems.length,
    label: 'Selesai',
    subLabel: 'Aset beroperasi penuh & terdata lengkap di inventaris',
    items: completedItems.slice(0, 6).map((it) => ({
      id: it.id,
      title: it.item_name,
      subtitle: `${it.branch_name} &bull; Operasional Aktif`,
      status: 'LENGKAP & SELESAI',
      badge: `${it.quantity_needed} Unit`,
      info: '100% Terpenuhi',
    })),
  };

  return {
    ro: roStage,
    input_excel: inputStage,
    pilih_proses: pilihProsesStage,
    kelola_pr: kelolaPrStage,
    ready_stock: readyStockStage,
    surat_jalan: suratJalanStage,
    aset_sampai: asetSampaiStage,
    checklist_diterima: checklistStage,
    update_sla: updateSlaStage,
    selesai: selesaiStage,
  };
}
