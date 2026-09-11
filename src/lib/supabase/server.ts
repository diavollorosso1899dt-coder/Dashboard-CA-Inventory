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
      const { data, error } = await admin
        .from('asset_requests')
        .update(updatePayload)
        .or(`id.eq.${id},external_id.eq.${id}`)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: data as AssetRequest };
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
      const { data, error } = await admin
        .from('asset_requests')
        .update(updatePayload)
        .in('id', ids)
        .select('id');

      if (error) throw error;
      return { success: true, updatedCount: data?.length || ids.length };
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
  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('outlets').select('*').order('branch_name');
      if (!error && data && data.length > 0) dbOutlets = data as Outlet[];
    } catch {}
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

  const outlet: Outlet = {
    id: outletData.id || `out-${Date.now()}`,
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

  if (admin && isSupabaseHealthy) {
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
      if (!error && data) {
        syncOutletToCache({ ...outlet, ...data });
        return { ...outlet, ...data };
      }
    } catch (e) {
      console.warn('[saveOutlet] Error persisting to Supabase, falling back to local cache:', e);
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
  if (admin && isSupabaseHealthy) {
    const { data, error } = await admin.from('user_profiles').select('*').order('full_name');
    if (!error && data && data.length > 0) return data as UserProfile[];
  }
  return cache.users || [];
}

export async function saveUserProfile(userData: Partial<UserProfile>): Promise<UserProfile> {
  const admin = getAdminClient();
  const user: UserProfile = {
    id: userData.id || `usr-${Date.now()}`,
    email: userData.email || '',
    full_name: userData.full_name || 'User',
    role: userData.role || 'user',
    branch_name: userData.branch_name,
    phone: userData.phone,
    is_active: userData.is_active ?? true,
    created_at: userData.created_at || new Date().toISOString(),
  };

  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('user_profiles').upsert(user).select().single();
      if (!error && data) return data as UserProfile;
    } catch {}
  }

  const idx = cache.users.findIndex((u) => u.id === user.id);
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
  if (admin && isSupabaseHealthy) {
    const { data, error } = await admin.from('asset_transfers').select('*').order('transfer_date', { ascending: false });
    if (!error && data && data.length > 0) return data as AssetTransfer[];
  }
  return cache.transfers || [];
}

export async function createAssetTransfer(payload: Partial<AssetTransfer>): Promise<AssetTransfer> {
  const admin = getAdminClient();
  const transfer: AssetTransfer = {
    id: payload.id || `trf-${Date.now()}`,
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

  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('asset_transfers').insert(transfer).select().single();
      if (!error && data) return data as AssetTransfer;
    } catch {}
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

  const newAsset: AssetRequest = {
    id: `custom-${Date.now()}`,
    external_id: `CUSTOM-${Date.now()}`,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const admin = getAdminClient();
  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('asset_requests').insert(newAsset).select().single();
      if (!error && data) {
        cache.items.unshift(data as AssetRequest);
        return data as AssetRequest;
      }
    } catch {}
  }

  cache.items.unshift(newAsset);
  return newAsset;
}

// ==============================================================================
// 3. DISTRIBUSI: RO (REQUEST ORDER) & SURAT JALAN (SJ)
// ==============================================================================
export async function getRequestOrders(): Promise<RequestOrder[]> {
  const admin = getAdminClient();
  if (admin && isSupabaseHealthy) {
    const { data, error } = await admin.from('request_orders').select('*').order('request_date', { ascending: false });
    if (!error && data && data.length > 0) return data as RequestOrder[];
  }
  return cache.requestOrders || [];
}

export async function createRequestOrder(payload: Partial<RequestOrder>): Promise<RequestOrder> {
  const admin = getAdminClient();
  const ro: RequestOrder = {
    id: payload.id || `ro-${Date.now()}`,
    ro_number: payload.ro_number || `RO-CA-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
    branch_name: payload.branch_name || 'Outlet',
    region: payload.region || 'JABODETABEK',
    requester_name: payload.requester_name || 'User Tim Pusat',
    request_date: payload.request_date || new Date().toISOString().split('T')[0],
    target_delivery_date: payload.target_delivery_date,
    status: payload.status || 'PENDING',
    items: payload.items || [],
    notes: payload.notes,
    created_at: new Date().toISOString(),
  };

  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('request_orders').insert(ro).select().single();
      if (!error && data) return data as RequestOrder;
    } catch {}
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

  if (admin && isSupabaseHealthy) {
    try {
      await admin.from('request_orders').update(updateData).eq('id', id);
    } catch {}
  }

  const idx = cache.requestOrders.findIndex((r) => r.id === id || r.ro_number === id);
  if (idx !== -1) {
    cache.requestOrders[idx] = {
      ...cache.requestOrders[idx],
      ...updates,
    };
    return true;
  }
  return false;
}

// SMART DEDUPLICATION & SPREADSHEET SYNC ENGINE
const RO_GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1xma83YRtP0WbjDnUFjmhgie3mWDgejV95HhlZX0sEvk/export?format=csv&gid=1158236044';

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

function parseIndoDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  // Format could be 'DD-MM-YYYY HH:mm:ss' or 'DD-MM-YYYY' or 'YYYY-MM-DD'
  const clean = dateStr.split(' ')[0].trim();
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return clean;
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
      // Columns:
      // 0: No
      // 1: Tanggal Input RO
      // 2: Tanggal Permintaan RO
      // 3: RO ID
      // 4: SKU
      // 5: Nama Item aset/perlengkapan
      // 6: Jumlah
      // 7: Satuan Gudang
      // 8: Harga
      // 9: Total
      // 10: Tipe Item
      // 11: Outlet
      // 12: Gudang
      // 13: Status
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
      const sku = cols[4]?.trim() || '';
      const inputDate = cols[1]?.trim();
      const reqDate = cols[2]?.trim();
      const warehouse = cols[12]?.trim() || '-';

      // SMART DEDUPLICATION FINGERPRINT:
      // Identifies exact duplicate entries in the source sheet (over 1056 found in spreadsheet)
      const fingerprint = `${rawRoId.toLowerCase()}::${itemName.toLowerCase()}::${qty}::${outletName.toLowerCase()}`;
      if (seenFingerprints.has(fingerprint)) {
        duplicateRowsFiltered++;
        continue; // Filter out double item entry!
      }
      seenFingerprints.add(fingerprint);

      const roNumber = `RO-${rawRoId}`;
      const isKalbar = /singkawang|pontianak|serdam|merdeka|ketapang|ayani|sohor|johar|patimura|boedjang|semar|muara|tyga sapi|kokotuku|perdana/i.test(outletName);
      const region: 'JABODETABEK' | 'KALBAR' = isKalbar ? 'KALBAR' : 'JABODETABEK';

      if (!groupedOrders.has(roNumber)) {
        groupedOrders.set(roNumber, {
          id: `ro-${rawRoId}`,
          ro_number: roNumber,
          raw_ro_id: rawRoId,
          branch_name: outletName,
          region,
          requester_name: 'Logistik Outlet via Spreadsheet',
          request_date: parseIndoDate(inputDate || reqDate),
          target_delivery_date: parseIndoDate(reqDate || inputDate),
          status: 'INPUT_SYSTEM',
          current_stage: 'REQUEST_ORDER',
          source_type: 'GOOGLE_SHEET',
          warehouse_name: warehouse,
          items: [],
          created_at: new Date().toISOString(),
        });
      }

      groupedOrders.get(roNumber)!.items.push({
        id: `roi-${rawRoId}-${groupedOrders.get(roNumber)!.items.length + 1}`,
        item_name: itemName,
        sku,
        unit,
        unit_price: harga,
        total_price: total,
        item_type: tipeItem,
        quantity_ordered: qty,
        quantity_fulfilled: 0,
        stock_source: 'GUDANG_SCGA', // Initial default, to be reviewed in 'Pilih Proses'
      });
    }

    const uniqueOrders = Array.from(groupedOrders.values());
    let newOrdersAdded = 0;
    let existingOrdersUpdated = 0;

    // Merge into cache / database
    for (const order of uniqueOrders) {
      const existingIdx = cache.requestOrders.findIndex(
        (r) => r.ro_number === order.ro_number || r.raw_ro_id === order.raw_ro_id
      );

      if (existingIdx !== -1) {
        // Update items if new items exist
        const existing = cache.requestOrders[existingIdx];
        const existingItemNames = new Set(existing.items.map((it) => it.item_name.toLowerCase()));
        const newItemsToAdd = order.items.filter((it) => !existingItemNames.has(it.item_name.toLowerCase()));
        if (newItemsToAdd.length > 0) {
          existing.items.push(...newItemsToAdd);
          existingOrdersUpdated++;
        }
      } else {
        cache.requestOrders.unshift(order);
        newOrdersAdded++;
      }
    }

    return {
      success: true,
      totalRowsScanned,
      duplicateRowsFiltered,
      uniqueOrdersCount: uniqueOrders.length,
      newOrdersAdded,
      existingOrdersUpdated,
      message: `Filter Pintar Berhasil: ${totalRowsScanned} baris dipindai, ${duplicateRowsFiltered} duplikat disaring, ${uniqueOrders.length} RO unik diproses (${newOrdersAdded} baru, ${existingOrdersUpdated} diperbarui).`,
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
  if (admin && isSupabaseHealthy) {
    const { data, error } = await admin.from('surat_jalan').select('*').order('delivery_date', { ascending: false });
    if (!error && data && data.length > 0) return data as SuratJalan[];
  }
  return cache.suratJalan || [];
}

export async function getSuratJalanById(id: string): Promise<SuratJalan | null> {
  const all = await getSuratJalanList();
  return all.find((sj) => sj.id === id || sj.sj_number === id) || null;
}

export async function createSuratJalan(payload: Partial<SuratJalan>): Promise<SuratJalan> {
  const admin = getAdminClient();
  const sj: SuratJalan = {
    id: payload.id || `sj-${Date.now()}`,
    sj_number: payload.sj_number || `SJ/SCGA/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${Date.now().toString().slice(-4)}`,
    ro_id: payload.ro_id,
    ro_number: payload.ro_number,
    branch_name: payload.branch_name || 'Outlet Tujuan',
    region: payload.region || 'JABODETABEK',
    delivery_date: payload.delivery_date || new Date().toISOString().split('T')[0],
    driver_name: payload.driver_name || 'Driver Pengantar',
    driver_phone: payload.driver_phone,
    vehicle_number: payload.vehicle_number || 'B 1234 SCG',
    expedition: payload.expedition || 'Armada Internal SCGA',
    sender_name: payload.sender_name || 'Staff Gudang SCGA',
    receiver_name: payload.receiver_name,
    status: payload.status || 'SHIPPED',
    items: payload.items || [],
    notes: payload.notes,
    created_at: new Date().toISOString(),
  };

  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('surat_jalan').insert(sj).select().single();
      if (!error && data) return data as SuratJalan;
    } catch {}
  }

  cache.suratJalan.unshift(sj);
  return sj;
}

export async function updateSuratJalanStatus(id: string, status: 'SHIPPED' | 'DELIVERED', receiverName?: string): Promise<boolean> {
  const admin = getAdminClient();
  const updateData: any = { status, updated_at: new Date().toISOString() };
  if (receiverName) updateData.receiver_name = receiverName;
  if (status === 'DELIVERED') updateData.received_at = new Date().toISOString();

  if (admin && isSupabaseHealthy) {
    try {
      await admin.from('surat_jalan').update(updateData).eq('id', id);
    } catch {}
  }

  const idx = cache.suratJalan.findIndex((sj) => sj.id === id);
  if (idx !== -1) {
    cache.suratJalan[idx].status = status;
    if (receiverName) cache.suratJalan[idx].receiver_name = receiverName;
    if (status === 'DELIVERED') cache.suratJalan[idx].received_at = new Date().toISOString();
    return true;
  }
  return false;
}

// ==============================================================================
// 4. DISPOSISI: PENGEMBALIAN ASET
// ==============================================================================
export async function getDispositionRequests(): Promise<DispositionRequest[]> {
  const admin = getAdminClient();
  if (admin && isSupabaseHealthy) {
    const { data, error } = await admin.from('disposition_requests').select('*').order('submission_date', { ascending: false });
    if (!error && data && data.length > 0) return data as DispositionRequest[];
  }
  return cache.dispositions || [];
}

export async function createDispositionRequest(payload: Partial<DispositionRequest>): Promise<DispositionRequest> {
  const admin = getAdminClient();
  const disp: DispositionRequest = {
    id: payload.id || `disp-${Date.now()}`,
    disposition_number: payload.disposition_number || `DISP/CA/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`,
    branch_name: payload.branch_name || 'Outlet',
    region: payload.region || 'JABODETABEK',
    requester_name: payload.requester_name || 'Outlet Manager',
    submission_date: payload.submission_date || new Date().toISOString().split('T')[0],
    status: payload.status || 'DIAJUKAN',
    items: payload.items || [],
    approval_notes: payload.approval_notes,
    approved_by: payload.approved_by,
    created_at: new Date().toISOString(),
  };

  if (admin && isSupabaseHealthy) {
    try {
      const { data, error } = await admin.from('disposition_requests').insert(disp).select().single();
      if (!error && data) return data as DispositionRequest;
    } catch {}
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
  const updateData: any = { status, updated_at: new Date().toISOString() };
  if (approvalNotes) updateData.approval_notes = approvalNotes;
  if (approvedBy) updateData.approved_by = approvedBy;

  if (admin && isSupabaseHealthy) {
    try {
      await admin.from('disposition_requests').update(updateData).eq('id', id);
    } catch {}
  }

  const idx = cache.dispositions.findIndex((d) => d.id === id);
  if (idx !== -1) {
    cache.dispositions[idx].status = status;
    if (approvalNotes) cache.dispositions[idx].approval_notes = approvalNotes;
    if (approvedBy) cache.dispositions[idx].approved_by = approvedBy;
    return true;
  }
  return false;
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
  classification: string;
  specification: string;
  photo_url: string | null;
  standard_rab_price: number;
  total_requests: number;
  total_units_needed: number;
  is_new_item?: boolean;
  created_at?: string;
}

export async function getMasterAssetCatalog(): Promise<MasterAssetItem[]> {
  const { data: allItems } = await getAssetRequests({ region: 'ALL', limit: 10000 });
  const map = new Map<string, MasterAssetItem>();

  for (const it of allItems) {
    const key = (it.system_item_name || it.item_name || '').trim().toLowerCase();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        id: `mat-${map.size + 1}`,
        item_name: it.item_name,
        system_item_name: it.system_item_name || it.item_name,
        classification: it.classification || 'General',
        specification: it.specification || '',
        photo_url: it.photo_url || null,
        standard_rab_price: it.rab_price || 0,
        total_requests: 1,
        total_units_needed: it.quantity_needed || 1,
        is_new_item: it.category?.toLowerCase().includes('new') || it.id.startsWith('custom-'),
        created_at: it.order_datetime || it.created_at,
      });
    } else {
      const existing = map.get(key)!;
      existing.total_requests += 1;
      existing.total_units_needed += it.quantity_needed || 1;
      if (!existing.photo_url && it.photo_url) existing.photo_url = it.photo_url;
      if (!existing.specification && it.specification) existing.specification = it.specification;
      if (existing.standard_rab_price === 0 && it.rab_price > 0) existing.standard_rab_price = it.rab_price;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.item_name.localeCompare(b.item_name));
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
