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
  DispositionRequest,
  ALL_FEATURE_IDS
} from './types';
import { fetchAllSheetsData } from '../sync/sheet-fetcher';
import { getDaysRemaining } from '../utils/date-formatter';
import { buildBranchOpeningSummaries } from '../dashboard/branch-summaries';
import { getItemImageUrl, setItemImageOverride } from '@/lib/assetImageHelper';
import { getItemSpecification, setItemSpecificationOverride } from '@/lib/assetSpecHelper';
import { sortOrdersNewestFirst } from '../utils/ro-sorter';
import {
  filterPurchaseRequirementHistory,
  matchesPurchaseRequirementFilter,
  mergeManualAssetEdit,
  sanitizeAssetRequestDbPayload,
} from '../procurement/pr-history';
import { encodeBranchAndRegion, parseBranchAndRegion } from '../access/app-feature';
import { matchesRoDateRange, RoDateField } from '../distribution/ro-date-filter';
import {
  applyConfirmedItemsToRequestOrders,
  normalizeConfirmedSjItems,
} from '../distribution/confirm-surat-jalan';
import {
  extractUnknownColumnFromError,
  mapAssetTransferToSuratJalan,
  mergeAssetTransfersLists,
  mergeSuratJalanLists,
  resolveTransferRegion,
  sanitizeAssetTransferDbPayload,
  sanitizeSuratJalanDbPayload,
  stripUnknownColumns,
} from '../distribution/transfer-sj-sync';
export { sortOrdersNewestFirst };

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseServiceKey;
  return Boolean(
    url &&
    key &&
    url.startsWith('http') &&
    !url.includes('your-project')
  );
};

export const getAdminClient = () => {
  if (!isServerSupabaseConfigured()) return null;
  if (global.__SUPABASE_ADMIN_CLIENT__) {
    return global.__SUPABASE_ADMIN_CLIENT__;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseServiceKey;
  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  global.__SUPABASE_ADMIN_CLIENT__ = client;
  return client;
};

/**
 * Insert/upsert yang tahan terhadap kolom opsional yang belum ada di Supabase.
 * PostgREST menolak seluruh payload bila satu kolom tidak dikenal (PGRST204),
 * sehingga baris penting seperti Surat Jalan bisa hilang tanpa jejak.
 * Helper ini membuang kolom yang disebut error lalu mencoba ulang.
 */
export async function writeRowResilient(
  table: 'asset_transfers' | 'surat_jalan' | 'request_orders',
  payload: Record<string, any>,
  options: { onConflict?: string } = {}
): Promise<{ data: Record<string, any> | null; error: string | null; droppedColumns: string[] }> {
  const admin = getAdminClient();
  if (!admin) return { data: null, error: 'Supabase belum dikonfigurasi', droppedColumns: [] };

  let next = { ...payload };
  const droppedColumns: string[] = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const query = (admin as any).from(table);
    const { data, error } = options.onConflict
      ? await query.upsert(next, { onConflict: options.onConflict }).select().single()
      : await query.insert(next).select().single();

    if (!error) {
      if (droppedColumns.length > 0) {
        console.warn(`[Supabase ${table}] kolom diabaikan karena tidak ada di skema:`, droppedColumns.join(', '));
      }
      return { data: data as Record<string, any>, error: null, droppedColumns };
    }

    const unknown = extractUnknownColumnFromError(error.message);
    if (!unknown || !(unknown in next)) {
      return { data: null, error: error.message, droppedColumns };
    }

    droppedColumns.push(unknown);
    next = stripUnknownColumns(next, [unknown]);
  }

  return { data: null, error: 'Gagal menyimpan: terlalu banyak kolom tidak dikenal', droppedColumns };
}

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
type CacheSignature = {
  count: number;
  maxUpdatedAt: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __SUPABASE_ADMIN_CLIENT__: any;
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
  // eslint-disable-next-line no-var
  var __ASSET_REQUESTS_CACHE__: {
    items: AssetRequest[];
    timestamp: number;
    signature?: CacheSignature;
  } | undefined;
  // eslint-disable-next-line no-var
  var __ASSET_REQUESTS_PENDING__: Promise<AssetRequest[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __RO_CACHE__: {
    items: RequestOrder[];
    timestamp: number;
    signature?: CacheSignature;
  } | undefined;
  // eslint-disable-next-line no-var
  var __RO_PENDING__: Promise<RequestOrder[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __OUTLETS_CACHE__: {
    items: Outlet[];
    timestamp: number;
  } | undefined;
  // eslint-disable-next-line no-var
  var __OUTLETS_PENDING__: Promise<Outlet[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __TRANSFERS_CACHE__: {
    items: AssetTransfer[];
    timestamp: number;
  } | undefined;
  // eslint-disable-next-line no-var
  var __TRANSFERS_PENDING__: Promise<AssetTransfer[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __SJ_CACHE__: {
    items: SuratJalan[];
    timestamp: number;
  } | undefined;
  // eslint-disable-next-line no-var
  var __SJ_PENDING__: Promise<SuratJalan[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __USERS_CACHE__: {
    items: UserProfile[];
    timestamp: number;
  } | undefined;
  // eslint-disable-next-line no-var
  var __USERS_PENDING__: Promise<UserProfile[]> | null | undefined;
  // eslint-disable-next-line no-var
  var __DELETED_RO_KEYS__: Set<string> | undefined;
}

if (!global.__DELETED_RO_KEYS__) {
  global.__DELETED_RO_KEYS__ = new Set<string>();
}

/**
 * Signature ringan untuk cache tabel besar (`count` + `updated_at` terbaru).
 * Dipakai saat halaman meminta data "fresh": kalau signature DB masih sama
 * dengan signature saat cache diisi, cache pasti belum berubah sehingga tidak
 * perlu menarik ribuan baris lagi (mis. asset_requests / request_orders).
 */
function computeCacheSignature(
  rows: Array<{ updated_at?: string | null }> | null | undefined
): CacheSignature {
  const list = rows || [];
  let maxUpdatedAt: string | null = null;
  for (const row of list) {
    const value = row?.updated_at;
    if (!value) continue;
    const text = String(value);
    if (!maxUpdatedAt || text > maxUpdatedAt) maxUpdatedAt = text;
  }
  return { count: list.length, maxUpdatedAt };
}

async function fetchTableSignature(table: string): Promise<CacheSignature | null> {
  const admin = getAdminClient();
  if (!admin) return null;
  try {
    const [countRes, latestRes] = await Promise.all([
      admin.from(table).select('id', { count: 'exact', head: true }),
      admin
        .from(table)
        .select('updated_at')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1),
    ]);
    if (countRes.error || latestRes.error) return null;
    if (typeof countRes.count !== 'number') return null;
    const latest = Array.isArray(latestRes.data) ? latestRes.data[0] : null;
    return {
      count: countRes.count,
      maxUpdatedAt: (latest?.updated_at as string | null) || null,
    };
  } catch {
    return null;
  }
}

function isSameSignature(a: CacheSignature | undefined, b: CacheSignature | null): boolean {
  if (!a || !b) return false;
  return a.count === b.count && (a.maxUpdatedAt || null) === (b.maxUpdatedAt || null);
}

/**
 * Cek murah sebelum full fetch saat mode fresh: kalau DB belum berubah sejak
 * cache diisi, pakai cache dan perpanjang TTL-nya. Mengembalikan false bila
 * ragu (tanpa signature / query gagal) supaya pemanggil tetap membaca DB.
 */
async function reuseCacheIfUnchanged(table: string): Promise<boolean> {
  const entry =
    table === 'asset_requests'
      ? global.__ASSET_REQUESTS_CACHE__
      : table === 'request_orders'
        ? global.__RO_CACHE__
        : undefined;
  if (!entry || entry.items.length === 0 || !entry.signature) return false;

  const dbSignature = await fetchTableSignature(table);
  if (!isSameSignature(entry.signature, dbSignature)) return false;

  entry.timestamp = Date.now();
  return true;
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
    transfers: [],
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
      const editedMap = new Map<string, any>();
      try {
        // Fetch existing manually edited external_ids to preserve dashboard updates
        const { data: existingEdits } = await admin
          .from('asset_requests')
          .select(
            'external_id, is_manually_edited, item_delivery_status, stock_status, pic_receiver, notes, procurement_status, pr_datetime, po_date, received_date, order_datetime, vendor_name, is_system_transfer'
          )
          .eq('is_manually_edited', true);

        (existingEdits || []).forEach((e: any) => editedMap.set(e.external_id, e));

        // Batch upsert in chunks of 500
        const chunkSize = 500;
        const syncTimestamp = new Date().toISOString();
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize).map((item) => {
            const { id, ...rest } = item;
            const manualEdit = editedMap.get(item.external_id);
            // updated_at wajib ikut berubah saat sync menulis data, supaya
            // instance lain yang memakai cache-signature tahu harus re-fetch.
            return {
              ...mergeManualAssetEdit(rest, manualEdit),
              updated_at: syncTimestamp,
            };
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

      // Also update memory cache.
      // PENTING: cache harus memakai baris hasil merge (manual edit tetap
      // menang), bukan `items` mentah dari Google Sheets. Kalau memakai data
      // sheet mentah, status PR yang baru diubah user akan tampak kembali ke
      // awal tepat setelah tombol "Sync Data" ditekan.
      const cachedItems = items.map((item) =>
        mergeManualAssetEdit(item, editedMap.get(item.external_id))
      );
      cache.items = cachedItems;
      cache.lastSynced = new Date().toISOString();
      cache.lastContentHash = contentHash;
      global.__ASSET_REQUESTS_CACHE__ = { items: cachedItems, timestamp: Date.now() };

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
      global.__ASSET_REQUESTS_CACHE__ = { items: mergedItems, timestamp: Date.now() };

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

const ASSET_REQUESTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit + Stale-While-Revalidate

function triggerAssetRequestsFetch(): Promise<AssetRequest[]> {
  if (global.__ASSET_REQUESTS_PENDING__) {
    return global.__ASSET_REQUESTS_PENDING__;
  }

  global.__ASSET_REQUESTS_PENDING__ = (async () => {
    try {
      if (isSupabaseHealthy !== false && isServerSupabaseConfigured()) {
        const admin = getAdminClient();
        if (admin) {
          const controller = new AbortController();
          // Beri waktu cukup untuk cold start Vercel + Supabase. Timeout terlalu
          // pendek membuat pembacaan "fresh" jatuh ke cache lama, sehingga status
          // yang baru diubah tampak kembali ke nilai sebelumnya.
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          try {
            // Fetch batches paralel (3300 baris = 4 batch x 1000)
            const [b0, b1, b2, b3] = await Promise.all([
              admin.from('asset_requests').select('*').order('order_datetime', { ascending: false, nullsFirst: false }).range(0, 999).abortSignal(controller.signal),
              admin.from('asset_requests').select('*').order('order_datetime', { ascending: false, nullsFirst: false }).range(1000, 1999).abortSignal(controller.signal),
              admin.from('asset_requests').select('*').order('order_datetime', { ascending: false, nullsFirst: false }).range(2000, 2999).abortSignal(controller.signal),
              admin.from('asset_requests').select('*').order('order_datetime', { ascending: false, nullsFirst: false }).range(3000, 3999).abortSignal(controller.signal),
            ]);
            clearTimeout(timeoutId);

            const all: AssetRequest[] = [];
            if (b0.data) all.push(...(b0.data as AssetRequest[]));
            if (b1.data) all.push(...(b1.data as AssetRequest[]));
            if (b2.data) all.push(...(b2.data as AssetRequest[]));
            if (b3.data) all.push(...(b3.data as AssetRequest[]));

            if (b3.data && b3.data.length === 1000) {
              const b4 = await admin.from('asset_requests').select('*').order('order_datetime', { ascending: false, nullsFirst: false }).range(4000, 4999);
              if (b4.data) all.push(...(b4.data as AssetRequest[]));
            }

            if (all.length > 0) {
              global.__ASSET_REQUESTS_CACHE__ = {
                items: all,
                timestamp: Date.now(),
                signature: computeCacheSignature(all),
              };
              cache.items = all;
              return all;
            }
          } catch {
            clearTimeout(timeoutId);
          }
        }
      }
    } finally {
      global.__ASSET_REQUESTS_PENDING__ = null;
    }

    return global.__ASSET_REQUESTS_CACHE__?.items || cache.items || [];
  })();

  return global.__ASSET_REQUESTS_PENDING__;
}

/**
 * Low-level cached fetcher for raw asset requests from Supabase with SWR, TTL and Promise deduplication
 */
export async function getAllAssetRequestsRaw(force = false): Promise<AssetRequest[]> {
  const now = Date.now();
  if (!force && global.__ASSET_REQUESTS_CACHE__ && global.__ASSET_REQUESTS_CACHE__.items.length > 0) {
    if (now - global.__ASSET_REQUESTS_CACHE__.timestamp >= ASSET_REQUESTS_CACHE_TTL_MS && !global.__ASSET_REQUESTS_PENDING__) {
      // Stale-While-Revalidate: perbarui cache di background tanpa memblokir request user
      void triggerAssetRequestsFetch();
    }
    return global.__ASSET_REQUESTS_CACHE__.items;
  }

  // Mode fresh: cukup cek signature murah. Full fetch hanya bila DB berubah.
  if (force && (await reuseCacheIfUnchanged('asset_requests'))) {
    return global.__ASSET_REQUESTS_CACHE__!.items;
  }

  return triggerAssetRequestsFetch();
}

export function invalidateAssetRequestsCache() {
  global.__ASSET_REQUESTS_CACHE__ = undefined;
  global.__ASSET_REQUESTS_PENDING__ = null;
}

/**
 * Get all asset requests with optional filtering (Ultra-fast in-memory filter)
 */
export async function getAssetRequests(options?: {
  region?: RegionType;
  branch?: string;
  rabNumber?: string;
  search?: string;
  isSystemTransfer?: boolean;
  limit?: number;
  offset?: number;
  /**
   * Bypass cache in-memory dan baca langsung dari Supabase.
   * Dipakai halaman yang menampilkan hasil edit (PR) agar update dari
   * instance server lain tidak tertimpa cache lama (TTL 5 menit).
   */
  fresh?: boolean;
}): Promise<{ data: AssetRequest[]; total: number; lastSynced: string | null }> {
  const allItems = await getAllAssetRequestsRaw(options?.fresh === true);
  let filtered = allItems;

  if (options?.region && options.region !== 'ALL') {
    filtered = filtered.filter((r) => r.region === options.region);
  }
  if (options?.branch && options.branch !== 'ALL') {
    const bLower = options.branch.toLowerCase();
    filtered = filtered.filter((r) => r.branch_name && r.branch_name.toLowerCase() === bLower);
  }
  if (options?.rabNumber) {
    const rabLower = options.rabNumber.toLowerCase();
    filtered = filtered.filter((r) => r.rab_number && r.rab_number.toLowerCase().includes(rabLower));
  }
  if (options?.isSystemTransfer) {
    filtered = filtered.filter((r) => r.is_system_transfer);
  }
  if (options?.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        (r.item_name && r.item_name.toLowerCase().includes(q)) ||
        (r.branch_name && r.branch_name.toLowerCase().includes(q)) ||
        (r.requester_name && r.requester_name.toLowerCase().includes(q)) ||
        (r.rab_number && r.rab_number.toLowerCase().includes(q)) ||
        (r.vendor_name && r.vendor_name.toLowerCase().includes(q))
    );
  }

  const total = filtered.length;
  const offset = options?.offset || 0;
  const limit = options?.limit ?? 100;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    data: paginated,
    total,
    lastSynced: cache.lastSynced,
  };
}

/**
 * Get single asset request by ID (UUID or external_id)
 */
export async function getAssetRequestById(id: string): Promise<AssetRequest | null> {
  const cached = cache.items.find((item) => item.id === id || item.external_id === id);
  if (cached) return cached;

  try {
    const admin = getAdminClient();
    if (admin) {
      let query = admin.from('asset_requests').select('*');
      if (isUuid(id)) {
        query = query.eq('id', id);
      } else {
        query = query.eq('external_id', id);
      }
      const { data, error } = await query.single();
      if (!error && data) {
        return data as AssetRequest;
      }
    }
  } catch (e) {
    console.error('Error fetching asset by id:', e);
  }
  return null;
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
    const nowIso = new Date().toISOString();
    const updatePayload = {
      ...payload,
      is_manually_edited: true,
      updated_at: nowIso,
    };
    const dbPayload = sanitizeAssetRequestDbPayload(payload, nowIso);

    const isRoItemId =
      id.startsWith('ro-pr-') ||
      id.startsWith('roi-') ||
      id.startsWith('ro-') ||
      id.includes('RO-') ||
      id.includes('ro-');

    if (admin && !isRoItemId) {
      let query = admin.from('asset_requests').update(dbPayload);
      if (isUuid(id)) {
        query = query.eq('id', id);
      } else {
        query = query.eq('external_id', id);
      }

      const { data, error } = await query.select().single();
      if (error) {
        // Jangan pura-pura sukses: kalau DB menolak, UI akan revert setelah
        // refresh karena cache instance lain masih berisi data lama.
        console.error('[Supabase updateAssetRequest error]:', error.message);
        return {
          success: false,
          error: `Gagal menyimpan perubahan ke database: ${error.message}`,
        };
      }
      if (!data) {
        return { success: false, error: 'Item tidak ditemukan di database' };
      }

      const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
      if (index !== -1) {
        cache.items[index] = { ...cache.items[index], ...data };
      }
      if (global.__ASSET_REQUESTS_CACHE__?.items) {
        const gIdx = global.__ASSET_REQUESTS_CACHE__.items.findIndex(
          (item) => item.id === id || item.external_id === id
        );
        if (gIdx !== -1) {
          global.__ASSET_REQUESTS_CACHE__.items[gIdx] = {
            ...global.__ASSET_REQUESTS_CACHE__.items[gIdx],
            ...data,
          };
        }
      }
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
      if (global.__ASSET_REQUESTS_CACHE__?.items) {
        const gIdx = global.__ASSET_REQUESTS_CACHE__.items.findIndex(
          (item) => item.id === id || item.external_id === id
        );
        if (gIdx !== -1) {
          global.__ASSET_REQUESTS_CACHE__.items[gIdx] = {
            ...global.__ASSET_REQUESTS_CACHE__.items[gIdx],
            ...updatePayload,
          };
        }
      }
      return { success: true, data: updated };
    }

    // Support updating items from Request Orders (PR items)
    if (isRoItemId) {
      console.log(`[PR UPDATE] Processing RO Item ID: ${id}`);
      cache.manualEdits.set(id, updatePayload);

      // Pastikan data RO yang dibaca adalah versi terbaru dari DB. Memakai
      // cache in-memory bisa menulis balik items lama dan menimpa perubahan
      // yang baru disimpan oleh instance server lain.
      const allRos = await getRequestOrders(true);
      console.log(`[PR UPDATE] Total ROs loaded: ${allRos.length}`);

      const rawDecodedId = decodeURIComponent(id).trim().toLowerCase();
      let matchedRo: RequestOrder | null = null;
      let matchedItem: any = null;

      for (const ro of allRos) {
        const roIdStr = (ro.id || '').toLowerCase();
        const roNumStr = (ro.ro_number || '').toLowerCase();
        const rawRoStr = (ro.raw_ro_id || '').toLowerCase();

        const roCouldMatch =
          !id.startsWith('ro-pr-') ||
          (roIdStr && rawDecodedId.includes(roIdStr)) ||
          (roNumStr && rawDecodedId.includes(roNumStr)) ||
          (rawRoStr && rawDecodedId.includes(rawRoStr));

        for (const it of (ro.items || [])) {
          const itId = (it.id || '').toLowerCase();
          const itName = (it.item_name || '').toLowerCase().trim();

          const checkId1 = `ro-pr-${ro.id}-${encodeURIComponent(it.item_name)}`.toLowerCase();
          const checkId2 = `ro-pr-${ro.id}-${it.item_name}`.toLowerCase();
          const checkId3 = it.id ? `ro-pr-${ro.id}-${it.id}`.toLowerCase() : '';
          const checkId4 = it.id ? `ro-${ro.id}-${it.id}`.toLowerCase() : '';

          const isDirectMatch =
            (itId && itId === rawDecodedId) ||
            checkId1 === rawDecodedId ||
            checkId2 === rawDecodedId ||
            (checkId3 && checkId3 === rawDecodedId) ||
            (checkId4 && checkId4 === rawDecodedId);

          const isPartialMatch =
            roCouldMatch && (
              (itId && rawDecodedId.includes(itId)) ||
              (itName && rawDecodedId.includes(itName))
            );

          if (isDirectMatch || isPartialMatch) {
            matchedRo = ro;
            matchedItem = it;
            break;
          }
        }
        if (matchedItem) break;
      }

      if (matchedRo && matchedItem) {
        console.log(`[PR UPDATE] Found matched item "${matchedItem.item_name}" in RO ${matchedRo.ro_number}`);

        const isFinished =
          payload.procurement_status === 'selesai' ||
          (payload.item_delivery_status && payload.item_delivery_status.toLowerCase().includes('ready')) ||
          (payload.stock_status && payload.stock_status.toLowerCase().includes('ready'));

        if (isFinished) {
          console.log(`[PR UPDATE] Marking item as GUDANG_SCGA (Ready Stock)`);
          matchedItem.stock_source = 'GUDANG_SCGA';
          matchedItem.quantity_fulfilled = matchedItem.quantity_ordered;
          matchedItem.is_arrived_at_warehouse = true;
          if (payload.received_date) {
            matchedItem.pr_arrival_date = payload.received_date;
          }

          const activeItems = (matchedRo.items || []).filter((i: any) => i.stock_source !== 'CANCELLED');
          const allReady = activeItems.length > 0 && activeItems.every((i: any) => i.stock_source === 'GUDANG_SCGA');
          if (allReady) {
            matchedRo.current_stage = 'READY_STOCK';
            matchedRo.status = 'READY_STOCK';
          } else {
            matchedRo.current_stage = 'KELOLA_PR';
          }
        }

        if (payload.order_datetime) {
          matchedRo.request_date = payload.order_datetime.includes('T') ? payload.order_datetime.split('T')[0] : payload.order_datetime;
        }
        if (payload.received_date) {
          matchedRo.received_date = payload.received_date;
          matchedRo.arrival_datetime = payload.received_date;
        }
        if (payload.vendor_name) matchedRo.pr_vendor_name = payload.vendor_name;
        if (payload.po_date) matchedRo.pr_po_number = matchedRo.pr_po_number || 'PO-AUTO';
        if (payload.notes || payload.item_notes) {
          matchedItem.notes = payload.item_notes || payload.notes;
        }
        if (payload.procurement_status) {
          matchedItem.procurement_status = payload.procurement_status;
        }

        const updateSuccess = await updateRequestOrder(matchedRo.id, {
          items: matchedRo.items,
          current_stage: matchedRo.current_stage,
          status: matchedRo.status,
          request_date: matchedRo.request_date,
          received_date: matchedRo.received_date,
          arrival_datetime: matchedRo.arrival_datetime,
          pr_vendor_name: matchedRo.pr_vendor_name,
          pr_po_number: matchedRo.pr_po_number,
        });

        invalidateRoCache();

        return {
          success: updateSuccess,
          data: {
            id,
            ...payload,
          } as any,
        };
      } else {
        console.error(`[PR UPDATE ERROR] RO item not found for ID: ${id}`);
        return { success: false, error: `Item RO tidak ditemukan untuk ID: ${id}` };
      }
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
    const nowIso = new Date().toISOString();
    const updatePayload = {
      ...payload,
      is_manually_edited: true,
      updated_at: nowIso,
    };
    const dbPayload = sanitizeAssetRequestDbPayload(payload, nowIso);

    if (admin) {
      const uuidIds = ids.filter(isUuid);
      const extIds = ids.filter((id) => !isUuid(id));
      let totalUpdated = 0;

      if (uuidIds.length > 0) {
        const { data, error } = await admin
          .from('asset_requests')
          .update(dbPayload)
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
          .update(dbPayload)
          .in('external_id', extIds)
          .select('id');
        if (error) {
          console.error('[Supabase updateAssetRequestsBulk extIds error]:', error.message);
        } else if (data) {
          totalUpdated += data.length;
        }
      }

      // Update in local & global cache in-place
      ids.forEach((id) => {
        const index = cache.items.findIndex((item) => item.id === id || item.external_id === id);
        if (index !== -1) {
          cache.items[index] = { ...cache.items[index], ...updatePayload };
          cache.manualEdits.set(id, updatePayload);
        }
        if (global.__ASSET_REQUESTS_CACHE__?.items) {
          const gIdx = global.__ASSET_REQUESTS_CACHE__.items.findIndex(
            (item) => item.id === id || item.external_id === id
          );
          if (gIdx !== -1) {
            global.__ASSET_REQUESTS_CACHE__.items[gIdx] = {
              ...global.__ASSET_REQUESTS_CACHE__.items[gIdx],
              ...updatePayload,
            };
          }
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
      if (global.__ASSET_REQUESTS_CACHE__?.items) {
        const gIdx = global.__ASSET_REQUESTS_CACHE__.items.findIndex(
          (item) => item.id === id || item.external_id === id
        );
        if (gIdx !== -1) {
          global.__ASSET_REQUESTS_CACHE__.items[gIdx] = {
            ...global.__ASSET_REQUESTS_CACHE__.items[gIdx],
            ...updatePayload,
          };
        }
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
export async function calculateDashboardMetrics(
  region: RegionType = 'ALL',
  fresh = false
): Promise<DashboardMetrics> {
  const { data: items } = await getAssetRequests({ region, limit: 15000, fresh });

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

  // Calculate upcoming openings directly from already-fetched items
  const branches = buildBranchOpeningSummaries(items, getDaysRemaining);
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
export async function getBranchOpeningSummaries(
  region: RegionType = 'ALL',
  fresh = false
): Promise<BranchOpeningSummary[]> {
  const { data: items } = await getAssetRequests({ region, limit: 15000, fresh });
  return buildBranchOpeningSummaries(items, getDaysRemaining);
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

// In-Memory Cache untuk Outlets (TTL 5 Menit + Stale-While-Revalidate)
const OUTLETS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateOutletsCache() {
  global.__OUTLETS_CACHE__ = undefined;
  global.__OUTLETS_PENDING__ = null;
}

function triggerOutletsFetch(): Promise<Outlet[]> {
  if (global.__OUTLETS_PENDING__) {
    return global.__OUTLETS_PENDING__;
  }

  global.__OUTLETS_PENDING__ = (async () => {
    try {
      const admin = getAdminClient();
      let dbOutlets: Outlet[] = [];
      let dbRoBranches: Array<{ branch_name: string; region: string; requester_name?: string }> = [];

      if (admin) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const cachedRos = global.__RO_CACHE__?.items;
          const [outletsRes, roRes] = await Promise.all([
            admin.from('outlets').select('*').order('branch_name').abortSignal(controller.signal),
            cachedRos && cachedRos.length > 0
              ? Promise.resolve({ data: cachedRos, error: null })
              : admin.from('request_orders').select('branch_name, region, requester_name').not('branch_name', 'is', null).abortSignal(controller.signal),
          ]);
          clearTimeout(timer);

          if (!outletsRes.error && outletsRes.data && outletsRes.data.length > 0) {
            dbOutlets = outletsRes.data as Outlet[];
          } else if (outletsRes.error) {
            console.error('[Supabase getOutlets error]:', outletsRes.error.message);
          }

          if (!roRes.error && roRes.data) {
            dbRoBranches = roRes.data as Array<{ branch_name: string; region: string; requester_name?: string }>;
          }
        } catch {
          // Abort or error, proceed with local cache
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

      const isInvalidBranch = (raw: string): boolean => {
        if (!raw) return true;
        const lower = raw.trim().toLowerCase();
        return (
          !lower ||
          lower === '-' ||
          lower === 'new item' ||
          lower === 'tanpa nama outlet' ||
          lower.startsWith('ast-') ||
          lower.startsWith('plk-')
        );
      };

      // 1. Add from cache.outlets
      if (cache.outlets) {
        for (const o of cache.outlets) {
          if (isInvalidBranch(o.branch_name || o.nama || '')) continue;
          const norm = normalizeOutlet(o);
          const key = norm.branch_name.toLowerCase();
          if (key) outletMap.set(key, norm);
        }
      }

      // 2. Add from Supabase database (takes precedence for richer data)
      for (const o of dbOutlets) {
        if (isInvalidBranch(o.branch_name || o.nama || '')) continue;
        const norm = normalizeOutlet(o);
        const key = norm.branch_name.toLowerCase();
        if (key) outletMap.set(key, norm);
      }

      // 3. Add dynamically from request_orders branches
      for (const ro of dbRoBranches) {
        if (isInvalidBranch(ro.branch_name)) continue;
        const cleanBranch = ro.branch_name.trim();
        const key = cleanBranch.toLowerCase();
        if (!outletMap.has(key)) {
          const isKalbar = (ro.region as string)?.toUpperCase() === 'KALBAR';
          const synthetic = normalizeOutlet({
            id: `out-ro-${hashOutletBranch(key)}`,
            branch_name: cleanBranch,
            nama: cleanBranch,
            region: isKalbar ? 'KALBAR' : 'JABODETABEK',
            status: 'Aktif',
            address: '',
            alamat: '',
            pic_name: ro.requester_name || '',
            pic_nama: ro.requester_name || '',
            pic_phone: '',
            telepon: '',
            notes: 'Master Data Outlet RO',
            created_at: new Date().toISOString(),
          });
          outletMap.set(key, synthetic);
        }
      }

      // 4. Scan asset_requests (items) to ensure any newly inputted or existing branch appears in the outlet list
      const assetItems = global.__ASSET_REQUESTS_CACHE__?.items || cache.items;
      if (assetItems) {
        for (const item of assetItems) {
          if (!item.branch_name || isInvalidBranch(item.branch_name)) continue;
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

      const result = Array.from(outletMap.values()).sort((a, b) => a.branch_name.localeCompare(b.branch_name));
      global.__OUTLETS_CACHE__ = { items: result, timestamp: Date.now() };
      return result;
    } finally {
      global.__OUTLETS_PENDING__ = null;
    }
  })();

  return global.__OUTLETS_PENDING__;
}

export async function getOutlets(force = false): Promise<Outlet[]> {
  const now = Date.now();
  if (!force && global.__OUTLETS_CACHE__ && global.__OUTLETS_CACHE__.items.length > 0) {
    if (now - global.__OUTLETS_CACHE__.timestamp >= OUTLETS_CACHE_TTL_MS && !global.__OUTLETS_PENDING__) {
      void triggerOutletsFetch();
    }
    return global.__OUTLETS_CACHE__.items;
  }

  return triggerOutletsFetch();
}

export async function saveOutlet(outletData: Partial<Outlet>): Promise<Outlet> {
  invalidateOutletsCache();
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
        // Jangan simpan hanya di cache: perubahan akan tampak berhasil lalu
        // hilang setelah refresh karena DB tidak benar-benar berubah.
        throw new Error(`Gagal menyimpan outlet ke database: ${error.message}`);
      }
      if (data) {
        syncOutletToCache({ ...outlet, ...data });
        return { ...outlet, ...data };
      }
    } catch (e: any) {
      console.error('[saveOutlet] Error persisting to Supabase:', e?.message);
      throw e instanceof Error ? e : new Error(String(e));
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

const USERS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateUsersCache() {
  global.__USERS_CACHE__ = undefined;
  global.__USERS_PENDING__ = null;
}

function triggerUsersFetch(): Promise<UserProfile[]> {
  if (global.__USERS_PENDING__) {
    return global.__USERS_PENDING__;
  }

  global.__USERS_PENDING__ = (async () => {
    try {
      const admin = getAdminClient();
      if (admin) {
        try {
          const { data, error } = await admin.from('user_profiles').select('*').order('full_name');
          if (!error && data && data.length > 0) {
            const parsed = data.map((u: any) => {
              const cachedUser = cache.users?.find((cu) => cu.email && cu.email.toLowerCase() === (u.email || '').toLowerCase());
              const isSuper = u.role === 'Super User' || u.role === 'super_user';
              let allowed = u.allowed_features;
              if (typeof allowed === 'string') {
                try { allowed = JSON.parse(allowed); } catch (e) { allowed = allowed.split(','); }
              }
              if (!Array.isArray(allowed) && cachedUser?.allowed_features) {
                allowed = cachedUser.allowed_features;
              }
              const { branchName, allowedRegion, allowedFeatures } = parseBranchAndRegion(
                u.branch_name || u.outlet_assigned,
                u.allowed_region || cachedUser?.allowed_region,
                u.role,
                Array.isArray(allowed) ? allowed : undefined
              );
              const effectiveFeatures = isSuper ? ALL_FEATURE_IDS : allowedFeatures;
              return {
                ...u,
                username: u.username || u.email,
                password: u.password || u.phone || cachedUser?.password || '',
                branch_name: branchName || undefined,
                outlet_assigned: branchName || undefined,
                allowed_region: allowedRegion,
                allowed_features: effectiveFeatures,
              };
            }) as UserProfile[];
            global.__USERS_CACHE__ = { items: parsed, timestamp: Date.now() };
            cache.users = parsed;
            return parsed;
          }
          if (error) console.error('[Supabase getUserProfiles error]:', error.message);
        } catch (err: any) {
          console.error('[Supabase getUserProfiles exception]:', err.message);
        }
      }

      const fallback = (cache.users || []).map((u) => {
        const isSuper = u.role === 'Super User' || u.role === 'super_user';
        const { branchName, allowedRegion, allowedFeatures } = parseBranchAndRegion(
          u.branch_name || u.outlet_assigned,
          u.allowed_region,
          u.role,
          u.allowed_features
        );
        return {
          ...u,
          username: u.username || u.email,
          password: u.password || u.phone || '',
          branch_name: branchName || undefined,
          outlet_assigned: branchName || undefined,
          allowed_region: allowedRegion,
          allowed_features: isSuper ? ALL_FEATURE_IDS : allowedFeatures,
        };
      });
      global.__USERS_CACHE__ = { items: fallback, timestamp: Date.now() };
      return fallback;
    } finally {
      global.__USERS_PENDING__ = null;
    }
  })();

  return global.__USERS_PENDING__;
}

export async function getUserProfiles(force = false): Promise<UserProfile[]> {
  const now = Date.now();
  if (!force && global.__USERS_CACHE__ && global.__USERS_CACHE__.items.length > 0) {
    if (now - global.__USERS_CACHE__.timestamp >= USERS_CACHE_TTL_MS && !global.__USERS_PENDING__) {
      void triggerUsersFetch();
    }
    return global.__USERS_CACHE__.items;
  }

  return triggerUsersFetch();
}

export async function saveUserProfile(userData: Partial<UserProfile>): Promise<UserProfile> {
  const admin = getAdminClient();
  const username = (userData.username || userData.email || '').trim().toLowerCase();
  const isSuper = userData.role === 'Super User' || userData.role === 'super_user';

  // Cari data user sebelumnya agar edit tanpa isi password tidak menghapus password lama
  let existingUser: any = cache.users?.find(
    (u) =>
      (userData.id && u.id === userData.id) ||
      (u.email && u.email.toLowerCase() === username) ||
      (u.username && u.username.toLowerCase() === username)
  );

  if (admin && !existingUser && (userData.id || username)) {
    try {
      const { data: foundRows } = await admin
        .from('user_profiles')
        .select('*')
        .or(userData.id && isUuid(userData.id) ? `id.eq.${userData.id},email.eq.${username}` : `email.eq.${username}`)
        .limit(1);
      if (foundRows && foundRows.length > 0) {
        existingUser = foundRows[0];
      }
    } catch {}
  }

  const existingParsed = existingUser
    ? parseBranchAndRegion(
        existingUser.branch_name || existingUser.outlet_assigned,
        existingUser.allowed_region,
        existingUser.role,
        existingUser.allowed_features
      )
    : null;

  const userId = ensureUuid(userData.id || existingUser?.id);
  const { branchName, allowedRegion } = parseBranchAndRegion(
    userData.branch_name !== undefined || userData.outlet_assigned !== undefined
      ? userData.branch_name || userData.outlet_assigned
      : existingParsed?.branchName,
    userData.allowed_region ?? existingParsed?.allowedRegion,
    userData.role || existingUser?.role
  );

  const allowedFeatures = isSuper
    ? ALL_FEATURE_IDS
    : Array.isArray(userData.allowed_features)
    ? userData.allowed_features
    : existingParsed?.allowedFeatures;

  const encodedBranch = encodeBranchAndRegion(
    branchName,
    allowedRegion,
    isSuper ? undefined : allowedFeatures
  );

  const inputPassword = (userData.password || userData.phone || '').trim();
  const effectivePassword =
    inputPassword || existingUser?.password || existingUser?.phone || 'password123';

  const user: UserProfile = {
    id: userId,
    username,
    email: username,
    password: effectivePassword,
    full_name: userData.full_name || existingUser?.full_name || 'User',
    role: userData.role || existingUser?.role || 'User',
    branch_name: branchName || undefined,
    outlet_assigned: branchName || undefined,
    allowed_region: allowedRegion,
    phone: effectivePassword,
    is_active: userData.is_active ?? existingUser?.is_active ?? true,
    allowed_features: allowedFeatures,
    created_at: userData.created_at || existingUser?.created_at || new Date().toISOString(),
  };

  if (admin) {
    try {
      const dbPayload: any = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        branch_name: encodedBranch,
        password: effectivePassword,
        phone: effectivePassword,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: new Date().toISOString(),
      };

      let res = await admin
        .from('user_profiles')
        .upsert(dbPayload, { onConflict: 'email' })
        .select()
        .single();

      if (res.error && res.error.message?.includes('password')) {
        delete dbPayload.password;
        res = await admin
          .from('user_profiles')
          .upsert(dbPayload, { onConflict: 'email' })
          .select()
          .single();
      }

      if (res.error) {
        console.error('[Supabase saveUserProfile error]:', res.error.message);
        // Sama seperti outlet/PR: jangan balas sukses bila DB menolak, karena
        // perubahan akan kembali ke nilai awal setelah halaman di-refresh.
        throw new Error(`Gagal menyimpan pengguna ke database: ${res.error.message}`);
      }
      if (res.data) {
        const result = {
          ...res.data,
          username: (res.data as any).username || res.data.email,
          password: (res.data as any).password || (res.data as any).phone || effectivePassword,
          branch_name: branchName || undefined,
          outlet_assigned: branchName || undefined,
          allowed_region: allowedRegion,
          allowed_features: user.allowed_features,
        } as UserProfile;

        syncUserToCache(result);
        return result;
      }
    } catch (err: any) {
      console.error('[Supabase saveUserProfile exception]:', err.message);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  syncUserToCache(user);
  return user;
}

function syncUserToCache(user: UserProfile) {
  if (!cache.users) cache.users = [];
  const idx = cache.users.findIndex((u) => u.id === user.id || (u.email && u.email.toLowerCase() === user.email.toLowerCase()));
  if (idx !== -1) {
    cache.users[idx] = { ...cache.users[idx], ...user };
  } else {
    cache.users.push(user);
  }
  if (global.__USERS_CACHE__?.items) {
    const gIdx = global.__USERS_CACHE__.items.findIndex(
      (u) => u.id === user.id || (u.email && u.email.toLowerCase() === user.email.toLowerCase())
    );
    if (gIdx !== -1) {
      global.__USERS_CACHE__.items[gIdx] = { ...global.__USERS_CACHE__.items[gIdx], ...user };
    } else {
      global.__USERS_CACHE__.items.push(user);
    }
  }
}

export async function deleteUserProfile(userIdOrEmail: string): Promise<boolean> {
  const admin = getAdminClient();
  const target = (userIdOrEmail || '').trim().toLowerCase();
  if (!target) return false;

  if (admin) {
    try {
      if (isUuid(userIdOrEmail)) {
        await admin.from('user_profiles').delete().eq('id', userIdOrEmail);
      } else {
        await admin.from('user_profiles').delete().eq('email', target);
      }
    } catch (err: any) {
      console.error('[Supabase deleteUserProfile exception]:', err.message);
    }
  }

  // Remove from in-memory cache
  if (cache.users) {
    cache.users = cache.users.filter(
      (u) => u.id !== userIdOrEmail && u.email?.toLowerCase() !== target && u.username?.toLowerCase() !== target
    );
  }
  if (global.__USERS_CACHE__?.items) {
    global.__USERS_CACHE__.items = global.__USERS_CACHE__.items.filter(
      (u) => u.id !== userIdOrEmail && u.email?.toLowerCase() !== target && u.username?.toLowerCase() !== target
    );
  }
  return true;
}


// ==============================================================================
// 2. MONITORING: TRANSFER ASET & INPUT ASET
// ==============================================================================
const TRANSFERS_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateTransfersCache() {
  global.__TRANSFERS_CACHE__ = undefined;
  global.__TRANSFERS_PENDING__ = null;
}

export function invalidateSjCache() {
  global.__SJ_CACHE__ = undefined;
  global.__SJ_PENDING__ = null;
}

function triggerTransfersFetch(): Promise<AssetTransfer[]> {
  if (global.__TRANSFERS_PENDING__) {
    return global.__TRANSFERS_PENDING__;
  }

  global.__TRANSFERS_PENDING__ = (async () => {
    try {
      const admin = getAdminClient();
      if (admin) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const { data, error } = await admin
            .from('asset_transfers')
            .select('*')
            .order('transfer_date', { ascending: false })
            .abortSignal(controller.signal);
          clearTimeout(timer);
          if (!error && Array.isArray(data)) {
            const merged = mergeAssetTransfersLists(data as AssetTransfer[], cache.transfers || []);
            global.__TRANSFERS_CACHE__ = { items: merged, timestamp: Date.now() };
            return merged;
          }
        } catch {
          // Abort or error
        }
      }
      const fallback = global.__TRANSFERS_CACHE__?.items || cache.transfers || [];
      // Hanya inisialisasi cache kalau memang belum ada. Kalau fetch gagal,
      // biarkan timestamp lama agar percobaan berikutnya membaca DB lagi.
      if (!global.__TRANSFERS_CACHE__) {
        global.__TRANSFERS_CACHE__ = { items: fallback, timestamp: Date.now() };
      }
      return fallback;
    } finally {
      global.__TRANSFERS_PENDING__ = null;
    }
  })();

  return global.__TRANSFERS_PENDING__;
}

export async function getAssetTransfers(force = false): Promise<AssetTransfer[]> {
  const now = Date.now();
  // `force` = selalu baca DB terbaru. Dipakai halaman/endpoint yang
  // menampilkan status yang bisa diubah, agar update dari instance server
  // lain tidak tertimpa cache in-memory instance ini.
  if (!force && global.__TRANSFERS_CACHE__ !== undefined) {
    if (now - global.__TRANSFERS_CACHE__.timestamp >= TRANSFERS_CACHE_TTL_MS && !global.__TRANSFERS_PENDING__) {
      void triggerTransfersFetch();
    }
    return mergeAssetTransfersLists(global.__TRANSFERS_CACHE__.items, cache.transfers || []);
  }

  return triggerTransfersFetch();
}

export async function createAssetTransfer(payload: Partial<AssetTransfer>): Promise<AssetTransfer> {
  const admin = getAdminClient();
  const transferId = ensureUuid(payload.id);
  const now = new Date();
  const year = now.getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);

  const resolvedRegion = resolveTransferRegion({
    explicitRegion: (payload as any).region,
    toLocation: payload.to_location,
    outlets: global.__OUTLETS_CACHE__?.items || cache.outlets,
    requestOrders: global.__RO_CACHE__?.items || cache.requestOrders,
    assets: global.__ASSET_REQUESTS_CACHE__?.items || cache.items,
  });

  const transfer: AssetTransfer = {
    id: transferId,
    transfer_number: payload.transfer_number || `TRF-MUT/${year}/${randomSuffix}`,
    surat_jalan_number: payload.surat_jalan_number || `SJ-MUT/${year}/${randomSuffix}`,
    source_type: payload.source_type || 'GUDANG_PUSAT',
    from_location: payload.from_location || 'Gudang Pusat SCGA',
    destination_type: payload.destination_type || 'OUTLET',
    to_location: payload.to_location || 'Outlet Cabang',
    region: resolvedRegion,
    transfer_date: payload.transfer_date || now.toISOString().split('T')[0],
    received_date: payload.received_date || null,
    status: payload.status || 'IN_TRANSIT',
    sender_pic: payload.sender_pic || 'Staff Logistik SCGA',
    receiver_pic: payload.receiver_pic || '',
    expedition_courier: payload.expedition_courier || 'Armada Internal SCGA',
    tracking_number: payload.tracking_number || `TRK-${Date.now().toString().slice(-6)}`,
    items: payload.items || [],
    notes: payload.notes || '',
    received_notes: payload.received_notes || '',
    created_at: now.toISOString(),
  };

  const mappedSj = mapAssetTransferToSuratJalan(transfer, resolvedRegion);

  if (admin) {
    try {
      const cleanTransferDb = sanitizeAssetTransferDbPayload(transfer);
      const { error } = await writeRowResilient('asset_transfers', cleanTransferDb);
      if (error) {
        console.error('[Supabase createAssetTransfer error]:', error);
      }
    } catch (err: any) {
      console.error('[Supabase createAssetTransfer exception]:', err.message);
    }

    try {
      const cleanSjDb = sanitizeSuratJalanDbPayload(mappedSj);
      const { error: sjErr } = await writeRowResilient('surat_jalan', cleanSjDb, { onConflict: 'id' });
      if (sjErr) {
        console.error('[Supabase createAssetTransfer -> surat_jalan error]:', sjErr);
      }
    } catch (err: any) {
      console.error('[Supabase createAssetTransfer -> surat_jalan exception]:', err.message);
    }
  }

  invalidateTransfersCache();
  invalidateSjCache();
  cache.transfers = [transfer, ...cache.transfers.filter((t) => t.id !== transfer.id)];
  cache.suratJalan = [
    mappedSj,
    ...cache.suratJalan.filter(
      (s) => s.id !== mappedSj.id && s.sj_number !== mappedSj.sj_number
    ),
  ];
  return transfer;
}

export async function updateAssetTransfer(id: string, payload: Partial<AssetTransfer>): Promise<AssetTransfer | null> {
  invalidateTransfersCache();
  invalidateSjCache();
  const admin = getAdminClient();

  let updated: AssetTransfer | null = null;
  cache.transfers = cache.transfers.map((t) => {
    if (t.id === id) {
      updated = { ...t, ...payload };
      return updated;
    }
    return t;
  });

  if (admin) {
    try {
      const cleanPayload = sanitizeAssetTransferDbPayload({
        ...(payload as Record<string, any>),
        // Selalu perbarui updated_at agar pembaca "fresh" bisa mendeteksi
        // perubahan status tanpa menarik seluruh tabel.
        updated_at: new Date().toISOString(),
      });
      if (Object.keys(cleanPayload).length > 0) {
        const { data, error } = await admin
          .from('asset_transfers')
          .update(cleanPayload)
          .eq('id', id)
          .select()
          .single();
        if (error) {
          console.error('[Supabase updateAssetTransfer error]:', error.message);
          // Jangan balas sukses bila DB menolak; status akan tampak berubah
          // lalu kembali ke awal setelah refresh / pindah instance.
          return null;
        }
        if (data) {
          updated = { ...(updated || {}), ...(data as AssetTransfer), ...payload } as AssetTransfer;
          cache.transfers = cache.transfers.map((t) => (t.id === id ? (updated as AssetTransfer) : t));
        }
      }
    } catch (err: any) {
      console.error('[Supabase updateAssetTransfer exception]:', err.message);
      return null;
    }

    try {
      const sjUpdate: Record<string, any> = {};
      if (payload.status) {
        sjUpdate.status =
          payload.status === 'RECEIVED' || payload.status === 'COMPLETED'
            ? 'DELIVERED'
            : payload.status === 'IN_TRANSIT'
              ? 'SHIPPED'
              : 'PROCESSED';
      }
      if (payload.receiver_pic !== undefined) sjUpdate.receiver_name = payload.receiver_pic;
      if (payload.received_date !== undefined) sjUpdate.received_at = payload.received_date;
      if (payload.items !== undefined) sjUpdate.items = payload.items;
      if (payload.received_notes !== undefined) sjUpdate.notes = payload.received_notes;
      else if (payload.notes !== undefined) sjUpdate.notes = payload.notes;

      if (Object.keys(sjUpdate).length > 0) {
        await admin.from('surat_jalan').update(sjUpdate).eq('id', id);
      }
    } catch (err: any) {
      console.error('[Supabase updateAssetTransfer -> surat_jalan exception]:', err.message);
    }
  }

  if (updated) {
    const resolvedRegion = resolveTransferRegion({
      explicitRegion: (updated as any).region,
      toLocation: (updated as AssetTransfer).to_location,
      outlets: global.__OUTLETS_CACHE__?.items || cache.outlets,
      requestOrders: global.__RO_CACHE__?.items || cache.requestOrders,
      assets: global.__ASSET_REQUESTS_CACHE__?.items || cache.items,
    });
    const mappedSj = mapAssetTransferToSuratJalan(updated, resolvedRegion);
    cache.suratJalan = cache.suratJalan.map((s) =>
      s.id === id || s.sj_number === mappedSj.sj_number ? { ...s, ...mappedSj } : s
    );
  }

  return updated;
}

export async function deleteAssetTransfer(id: string): Promise<{ success: boolean }> {
  invalidateTransfersCache();
  invalidateSjCache();
  const admin = getAdminClient();
  if (admin) {
    try {
      await admin.from('asset_transfers').delete().eq('id', id);
      await admin.from('surat_jalan').delete().eq('id', id);
    } catch (err: any) {
      console.error('[Supabase deleteAssetTransfer exception]:', err.message);
    }
  }
  cache.transfers = cache.transfers.filter((t) => t.id !== id);
  cache.suratJalan = cache.suratJalan.filter((s) => s.id !== id);
  return { success: true };
}

export async function clearAllAssetTransfers(): Promise<{ success: boolean; count: number }> {
  invalidateTransfersCache();
  invalidateSjCache();
  const admin = getAdminClient();
  let count = 0;
  if (admin) {
    try {
      const { data, error } = await admin
        .from('asset_transfers')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select('id');
      if (!error && data) {
        count = data.length;
      }
    } catch (err: any) {
      console.error('[Supabase clearAllAssetTransfers exception]:', err.message);
    }
  }

  count = Math.max(count, cache.transfers.length);
  cache.transfers = [];

  return { success: true, count };
}

export async function resetAllSystemTransfers(): Promise<{ success: boolean; resetCount: number }> {
  let resetCount = 0;
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('asset_requests')
        .update({ is_system_transfer: false, updated_at: new Date().toISOString() })
        .eq('is_system_transfer', true)
        .select('id');
      if (!error && data) {
        resetCount = data.length;
      }
    } catch (err: any) {
      console.error('[Supabase resetAllSystemTransfers exception]:', err.message);
    }
  }

  cache.items.forEach((it) => {
    if (it.is_system_transfer) {
      it.is_system_transfer = false;
      resetCount++;
    }
  });

  cache.manualEdits.forEach((edit) => {
    if (edit.is_system_transfer) {
      edit.is_system_transfer = false;
    }
  });

  return { success: true, resetCount };
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
        if (global.__ASSET_REQUESTS_CACHE__?.items) {
          global.__ASSET_REQUESTS_CACHE__.items.unshift(data as AssetRequest);
        }
        return data as AssetRequest;
      }
    } catch (err: any) {
      console.error('[Supabase createAssetRequest exception]:', err.message);
    }
  }

  cache.items.unshift(newAsset);
  if (global.__ASSET_REQUESTS_CACHE__?.items) {
    global.__ASSET_REQUESTS_CACHE__.items.unshift(newAsset);
  }
  return newAsset;
}

// ==============================================================================
// 3. DISTRIBUSI: RO (REQUEST ORDER) & SURAT JALAN (SJ)
// ==============================================================================
export function deduplicateOrderItems(orders: RequestOrder[]): RequestOrder[] {
  const seenRoNumbers = new Set<string>();
  const sanitizedOrders: RequestOrder[] = [];

  for (const ro of orders) {
    const roKey = `${ro.region || ''}::${(ro.ro_number || ro.id || '').trim().toLowerCase()}`;
    if (!roKey || seenRoNumbers.has(roKey)) continue;
    seenRoNumbers.add(roKey);

    // Deduplikasi item ganda di dalam dokumen RO yang sama
    const seenItemKeys = new Set<string>();
    const uniqueItems = (ro.items || []).filter((it) => {
      const itemKey = `${it.item_name.toLowerCase().trim()}::${it.quantity_ordered}`;
      if (seenItemKeys.has(itemKey)) return false;
      seenItemKeys.add(itemKey);
      return true;
    });

    sanitizedOrders.push({
      ...ro,
      items: uniqueItems,
    });
  }

  return sanitizedOrders;
}

// In-Memory Cache untuk Request Orders (TTL 5 Menit + Stale-While-Revalidate + Promise Deduplication)
const RO_CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateRoCache() {
  global.__RO_CACHE__ = undefined;
  global.__RO_PENDING__ = null;
}

function triggerRoFetch(): Promise<RequestOrder[]> {
  if (global.__RO_PENDING__) {
    return global.__RO_PENDING__;
  }

  global.__RO_PENDING__ = (async () => {
    const admin = getAdminClient();
    if (admin) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        // Query batch 0-999 dan 1000-1999 secara paralel dengan urutan deterministik
        const [res1, res2] = await Promise.all([
          admin
            .from('request_orders')
            .select('*')
            .order('request_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('ro_number', { ascending: false })
            .range(0, 999)
            .abortSignal(controller.signal),
          admin
            .from('request_orders')
            .select('*')
            .order('request_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .order('ro_number', { ascending: false })
            .range(1000, 1999)
            .abortSignal(controller.signal),
        ]);
        clearTimeout(timer);

        const allOrders: RequestOrder[] = [];
        if (res1.data) allOrders.push(...(res1.data as RequestOrder[]));
        if (res2.data) allOrders.push(...(res2.data as RequestOrder[]));

        // Jika data lebih dari 2000, ambil batch berikutnya
        if (res2.data && res2.data.length === 1000) {
          let from = 2000;
          let hasMore = true;
          while (hasMore) {
            const { data } = await admin
              .from('request_orders')
              .select('*')
              .order('request_date', { ascending: false, nullsFirst: false })
              .order('created_at', { ascending: false })
              .order('ro_number', { ascending: false })
              .range(from, from + 999);
            if (data && data.length > 0) {
              allOrders.push(...(data as RequestOrder[]));
              if (data.length < 1000) hasMore = false;
              else from += 1000;
            } else {
              hasMore = false;
            }
          }
        }

        if (allOrders.length > 0) {
          const deduplicated = deduplicateOrderItems(allOrders);
          const sorted = sortOrdersNewestFirst(deduplicated);
          global.__RO_CACHE__ = {
            items: sorted,
            timestamp: Date.now(),
            // Signature dihitung dari baris DB mentah (sebelum dedupe) agar
            // bisa dibandingkan langsung dengan count tabel di Supabase.
            signature: computeCacheSignature(allOrders),
          };
          cache.requestOrders = sorted;
          return sorted;
        }
      } catch {
        // Abort or error, proceed to fallback
      }
    }

    // Fallback ke cache yang sudah ada tanpa memicu Google Sheets sync yang lambat.
    // Jangan menandai cache lama sebagai "baru": kalau timestamp di-reset, data
    // basi akan dianggap segar selama 5 menit berikutnya.
    const existing = global.__RO_CACHE__?.items;
    if (existing && existing.length > 0) return existing;

    const fallback = sortOrdersNewestFirst(deduplicateOrderItems(cache.requestOrders || []));
    global.__RO_CACHE__ = { items: fallback, timestamp: Date.now() };
    return fallback;
  })().finally(() => {
    global.__RO_PENDING__ = null;
  });

  return global.__RO_PENDING__;
}

export async function getRequestOrders(force = false): Promise<RequestOrder[]> {
  const now = Date.now();
  // `force` dipakai halaman PR agar selalu membaca status RO terbaru dari DB,
  // bukan cache in-memory instance lain yang bisa tertinggal beberapa menit.
  if (!force && global.__RO_CACHE__ && global.__RO_CACHE__.items.length > 0) {
    if (now - global.__RO_CACHE__.timestamp >= RO_CACHE_TTL_MS && !global.__RO_PENDING__) {
      // Stale-While-Revalidate: refresh di background tanpa memblokir request user
      void triggerRoFetch();
    }
    return global.__RO_CACHE__.items;
  }

  // Mode fresh: cek signature murah dulu, full fetch hanya bila DB berubah.
  if (force && (await reuseCacheIfUnchanged('request_orders'))) {
    return global.__RO_CACHE__!.items;
  }

  return triggerRoFetch();
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
        if (global.__RO_CACHE__?.items) {
          global.__RO_CACHE__.items = [
            data as RequestOrder,
            ...global.__RO_CACHE__.items.filter((r) => r.id !== (data as RequestOrder).id && r.ro_number !== (data as RequestOrder).ro_number),
          ];
        }
        return data as RequestOrder;
      }
    } catch (err: any) {
      console.error('[Supabase createRequestOrder exception]:', err.message);
    }
  }

  cache.requestOrders.unshift(ro);
  if (global.__RO_CACHE__?.items) {
    global.__RO_CACHE__.items = [
      ro,
      ...global.__RO_CACHE__.items.filter((r) => r.id !== ro.id && r.ro_number !== ro.ro_number),
    ];
  }
  return ro;
}

export async function updateRequestOrderStatus(id: string, status: RequestOrder['status']): Promise<boolean> {
  return updateRequestOrder(id, { status });
}

export async function updateRequestOrder(id: string, updates: Partial<RequestOrder>): Promise<boolean> {
  const admin = getAdminClient();
  const updateData: any = { ...updates, updated_at: new Date().toISOString() };

  // Baca RO terbaru bila cache tidak memuat dokumen ini, supaya penulisan
  // balik (mis. items/stage) tidak memakai data lama dari instance lain.
  let cachedOrder =
    (global.__RO_CACHE__?.items || []).find((r: RequestOrder) => r.id === id || r.ro_number === id) ||
    cache.requestOrders.find((r) => r.id === id || r.ro_number === id);

  if (admin && !cachedOrder) {
    try {
      const allOrders = await getRequestOrders(true);
      cachedOrder = allOrders.find((r: RequestOrder) => r.id === id || r.ro_number === id);
    } catch {
      // Abaikan; pencocokan di bawah masih bisa memakai id/nomor RO.
    }
  }

  const roNumber = updates.ro_number || cachedOrder?.ro_number;
  const rawRoId = cachedOrder?.raw_ro_id || (roNumber ? roNumber.replace(/^RO-?/i, '') : null);
  const cleanRawId = rawRoId ? rawRoId.replace(/[^\w]/g, '') : null;

  if (admin) {
    let updatedRows = 0;

    try {
      if (isUuid(id)) {
        const { data, error } = await admin
          .from('request_orders')
          .update(updateData)
          .eq('id', id)
          .select('id');
        if (error) {
          console.error('[Supabase updateRequestOrder by id error]:', error.message);
        } else {
          updatedRows += data?.length || 0;
        }
      }

      // Also update any matching rows by ro_number or raw_ro_id to synchronize duplicate entries in Supabase
      if (rawRoId) {
        const { data, error } = await admin
          .from('request_orders')
          .update(updateData)
          .or(`raw_ro_id.eq.${rawRoId},ro_number.eq.RO-${rawRoId},ro_number.ilike.%${cleanRawId}%`)
          .select('id');
        if (error) {
          console.error('[Supabase updateRequestOrder by ro error]:', error.message);
        } else {
          updatedRows += data?.length || 0;
        }
      } else if (roNumber) {
        const { data, error } = await admin
          .from('request_orders')
          .update(updateData)
          .eq('ro_number', roNumber)
          .select('id');
        if (error) {
          console.error('[Supabase updateRequestOrder by number error]:', error.message);
        } else {
          updatedRows += data?.length || 0;
        }
      }
    } catch (err: any) {
      console.error('[Supabase updateRequestOrder exception]:', err.message);
    }

    // Jangan balas sukses kalau DB tidak menulis apa pun. Tanpa ini UI
    // menampilkan status baru sebentar, lalu "kembali ke awal" saat refresh.
    if (updatedRows === 0) {
      return false;
    }
  }

  // Update in-memory cache secara langsung agar response super cepat tanpa lag
  if (global.__RO_CACHE__ && global.__RO_CACHE__.items) {
    global.__RO_CACHE__.items = global.__RO_CACHE__.items.map((r: RequestOrder) => {
      const match =
        r.id === id ||
        r.ro_number === id ||
        (roNumber && r.ro_number === roNumber) ||
        (cleanRawId && (r.raw_ro_id || '').replace(/[^\w]/g, '') === cleanRawId);
      return match ? { ...r, ...updates } : r;
    });
  }

  cache.requestOrders = cache.requestOrders.map((r) => {
    const match =
      r.id === id ||
      r.ro_number === id ||
      (roNumber && r.ro_number === roNumber) ||
      (cleanRawId && (r.raw_ro_id || '').replace(/[^\w]/g, '') === cleanRawId);
    return match ? { ...r, ...updates } : r;
  });

  return true;
}

export function isRoDeleted(key?: string | null): boolean {
  if (!key) return false;
  const raw = String(key).toLowerCase().trim();
  const clean = raw.replace(/^ro[-_\s]*/i, '').replace(/[^\w]/g, '').trim();
  const set = global.__DELETED_RO_KEYS__;
  if (!set) return false;
  return set.has(raw) || (clean.length > 0 && set.has(clean));
}

export function markRoDeleted(key?: string | null): void {
  if (!key) return;
  if (!global.__DELETED_RO_KEYS__) {
    global.__DELETED_RO_KEYS__ = new Set<string>();
  }
  const raw = String(key).toLowerCase().trim();
  const clean = raw.replace(/^ro[-_\s]*/i, '').replace(/[^\w]/g, '').trim();
  global.__DELETED_RO_KEYS__.add(raw);
  if (clean) global.__DELETED_RO_KEYS__.add(clean);
}

export async function deleteRequestOrder(id: string): Promise<boolean> {
  const admin = getAdminClient();
  const cachedOrder =
    (global.__RO_CACHE__?.items || []).find((r: RequestOrder) => r.id === id || r.ro_number === id) ||
    cache.requestOrders.find((r) => r.id === id || r.ro_number === id);

  const roNumber = cachedOrder?.ro_number || id;
  const rawRoId = cachedOrder?.raw_ro_id || (roNumber ? roNumber.replace(/^RO-?/i, '') : null);
  const cleanRawId = rawRoId ? rawRoId.replace(/[^\w]/g, '') : null;

  markRoDeleted(id);
  markRoDeleted(roNumber);
  if (rawRoId) markRoDeleted(rawRoId);
  if (cleanRawId) markRoDeleted(cleanRawId);

  if (admin) {
    try {
      if (isUuid(id)) {
        await admin.from('request_orders').delete().eq('id', id);
      }
      if (rawRoId) {
        await admin
          .from('request_orders')
          .delete()
          .or(`raw_ro_id.eq.${rawRoId},ro_number.eq.RO-${rawRoId},ro_number.ilike.%${cleanRawId}%`);
      } else if (roNumber) {
        await admin.from('request_orders').delete().eq('ro_number', roNumber);
      }
    } catch (err: any) {
      console.error('[Supabase deleteRequestOrder exception]:', err.message);
    }
  }

  // Remove from memory cache
  if (global.__RO_CACHE__ && global.__RO_CACHE__.items) {
    global.__RO_CACHE__.items = global.__RO_CACHE__.items.filter((r: RequestOrder) => {
      const match =
        r.id === id ||
        r.ro_number === id ||
        (roNumber && r.ro_number === roNumber) ||
        (cleanRawId && (r.raw_ro_id || '').replace(/[^\w]/g, '') === cleanRawId);
      return !match;
    });
  }

  cache.requestOrders = cache.requestOrders.filter((r) => {
    const match =
      r.id === id ||
      r.ro_number === id ||
      (roNumber && r.ro_number === roNumber) ||
      (cleanRawId && (r.raw_ro_id || '').replace(/[^\w]/g, '') === cleanRawId);
    return !match;
  });

  return true;
}

// SMART DEDUPLICATION & SPREADSHEET SYNC ENGINE (MULTISOURCE: KALBAR & JABO)
const RO_SOURCES: Array<{ name: string; region: 'KALBAR' | 'JABODETABEK'; url: string }> = [
  {
    name: 'RO KALBAR',
    region: 'KALBAR',
    url:
      process.env.GOOGLE_SHEET_RO_KALBAR_URL ||
      'https://docs.google.com/spreadsheets/d/15Ir0Rc9y7N8qMKJWMoPFPWD0TX_bhQF-S2F6CMCtSIM/export?format=csv&gid=0',
  },
  {
    name: 'RO JABODETABEK',
    region: 'JABODETABEK',
    url:
      process.env.GOOGLE_SHEET_RO_JABO_URL ||
      'https://docs.google.com/spreadsheets/d/15Ir0Rc9y7N8qMKJWMoPFPWD0TX_bhQF-S2F6CMCtSIM/export?format=csv&gid=1529640038',
  },
];

export function normalizeRoId(raw: string | null | undefined): string {
  if (!raw) return '';
  let id = String(raw).trim().replace(/^RO[-_\s]*/i, '');
  if (/^[\d.]+$/.test(id) && id.includes('.')) {
    id = id.replace(/\./g, '');
  }
  return id.trim();
}

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

function parseIndoCurrency(val?: string): number {
  if (!val) return 0;
  const clean = val.trim();
  const beforeComma = clean.split(',')[0];
  const num = parseInt(beforeComma.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 0 : num;
}

function parseIndoQty(val?: string): number {
  if (!val) return 1;
  const clean = val.trim().split(',')[0];
  const num = parseInt(clean.replace(/[^\d]/g, ''), 10);
  return isNaN(num) || num < 0 ? 1 : num;
}

function detectRoColumns(headerLine: string, defaultRegion: 'KALBAR' | 'JABODETABEK') {
  const cols = parseCSVLine(headerLine).map((c) => c.toLowerCase().trim());

  let roIdIdx = cols.findIndex((c) => c === 'ro id' || c.includes('ro id') || c === 'id ro');
  let itemNameIdx = cols.findIndex((c) => c.includes('nama item') || c.includes('nama barang'));
  let qtyIdx = cols.findIndex((c) => c === 'jumlah' || c === 'qty');
  let unitIdx = cols.findIndex((c) => c.includes('satuan'));
  let hargaIdx = cols.findIndex((c) => c === 'harga');
  let totalIdx = cols.findIndex((c) => c === 'total');
  let tipeIdx = cols.findIndex((c) => c.includes('tipe'));
  let outletIdx = cols.findIndex((c) => c === 'outlet' || c.includes('cabang'));
  let warehouseIdx = cols.findIndex((c) => c === 'gudang');
  let statusIdx = cols.findIndex((c) => c === 'status');
  let skuIdx = cols.findIndex((c) => c === 'sku');
  let inputDateIdx = cols.findIndex((c) => c.includes('tgl input') || c.includes('tanggal input'));
  let reqDateIdx = cols.findIndex((c) => c.includes('tgl permintaan') || c.includes('tanggal permintaan'));

  if (defaultRegion === 'KALBAR') {
    if (roIdIdx === -1) roIdIdx = 3;
    if (skuIdx === -1) skuIdx = 4;
    if (itemNameIdx === -1) itemNameIdx = 5;
    if (qtyIdx === -1) qtyIdx = 6;
    if (unitIdx === -1) unitIdx = 7;
    if (hargaIdx === -1) hargaIdx = 8;
    if (totalIdx === -1) totalIdx = 9;
    if (tipeIdx === -1) tipeIdx = 10;
    if (outletIdx === -1) outletIdx = 11;
    if (warehouseIdx === -1) warehouseIdx = 12;
    if (statusIdx === -1) statusIdx = 13;
    if (inputDateIdx === -1) inputDateIdx = 1;
    if (reqDateIdx === -1) reqDateIdx = 2;
  } else {
    // JABODETABEK format:
    // [0] Bulan, [1] tgl input, [2] tgl permintaan, [3] outlet/ro_id, [4] nama item, [5] qty, [6] unit, [7] harga, [8] total, [9] tipe, [10] outlet name, [11] gudang, [12] status
    if (roIdIdx === -1) roIdIdx = 3;
    if (itemNameIdx === -1) itemNameIdx = 4;
    if (qtyIdx === -1) qtyIdx = 5;
    if (unitIdx === -1) unitIdx = 6;
    if (hargaIdx === -1) hargaIdx = 7;
    if (totalIdx === -1) totalIdx = 8;
    if (tipeIdx === -1) tipeIdx = 9;
    if (outletIdx === 3 || outletIdx === -1) outletIdx = 10;
    if (warehouseIdx === -1) warehouseIdx = 11;
    if (statusIdx === -1) statusIdx = 12;
    if (inputDateIdx === -1) inputDateIdx = 1;
    if (reqDateIdx === -1) reqDateIdx = 2;
  }

  return {
    roIdIdx,
    skuIdx,
    itemNameIdx,
    qtyIdx,
    unitIdx,
    hargaIdx,
    totalIdx,
    tipeIdx,
    outletIdx,
    warehouseIdx,
    statusIdx,
    inputDateIdx,
    reqDateIdx,
  };
}

function parseIndoDate(dateStr?: string, fallbackToNull = false): string | null {
  if (!dateStr || typeof dateStr !== 'string') return fallbackToNull ? null : new Date().toISOString().split('T')[0];
  const clean = dateStr.split(' ')[0].trim();
  if (
    !clean ||
    clean === '-' ||
    clean.includes('1899') ||
    clean.includes('1900') ||
    clean.startsWith('30/12/99') ||
    clean.startsWith('12/30/1899')
  ) {
    return fallbackToNull ? null : new Date().toISOString().split('T')[0];
  }

  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);
    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      // YYYY-MM-DD format
      if (parts[0].length === 4) {
        return `${parts[0]}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
      // DD-MM-YYYY or DD/MM/YYYY format (Indonesian standard)
      let year = p2;
      if (year < 100) year += 2000;
      let day = p0;
      let month = p1;
      // If month > 12 and day <= 12, it is US MM/DD/YYYY
      if (month > 12 && day <= 12) {
        const temp = day;
        day = month;
        month = temp;
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  /** True only when at least one RO row was actually inserted or modified in the database. */
  changed: boolean;
  message: string;
}

// Deterministic JSON serialization (sorted keys, undefined dropped) so that values read back
// from Postgres JSONB (which reorders keys) compare equal to freshly built objects.
function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

const RO_COMPARE_FIELDS = [
  'branch_name',
  'region',
  'requester_name',
  'request_date',
  'target_delivery_date',
  'status',
  'current_stage',
  'source_type',
  'warehouse_name',
  'items',
] as const;

function isRoRowChanged(existing: any, next: any): boolean {
  return RO_COMPARE_FIELDS.some((f) => stableStringify(existing[f] ?? null) !== stableStringify(next[f] ?? null));
}

export async function syncRequestOrdersFromSheet(
  options: {
    clearOldSheetData?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    dateField?: RoDateField;
  } = {}
): Promise<RoSyncResult> {
  try {
    const admin = getAdminClient();
    if (options.clearOldSheetData && admin) {
      try {
        await admin.from('request_orders').delete().eq('source_type', 'GOOGLE_SHEET');
      } catch (delErr: any) {
        console.warn('[RO Sync] Warning clearing old GOOGLE_SHEET rows:', delErr?.message);
      }
      cache.requestOrders = [];
      invalidateRoCache();
    }

    let totalRowsScanned = 0;
    let duplicateRowsFiltered = 0;
    const seenFingerprints = new Set<string>();
    const groupedOrders = new Map<string, RequestOrder>();
    const syncedSources: string[] = [];

    for (const source of RO_SOURCES) {
      try {
        const response = await fetch(source.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          next: { revalidate: 0 },
        });

        if (!response.ok) {
          console.warn(`[RO Sync] Gagal mengunduh spreadsheet ${source.name} (HTTP ${response.status})`);
          continue;
        }

        const csvText = await response.text();
        const rawLines = csvText.split('\n');
        if (rawLines.length <= 1) continue;

        const cols = detectRoColumns(rawLines[0], source.region);
        syncedSources.push(source.name);

        for (let i = 1; i < rawLines.length; i++) {
          const line = rawLines[i].trim();
          if (!line) continue;
          totalRowsScanned++;

          const parts = parseCSVLine(line);
          const rawRoId = normalizeRoId(parts[cols.roIdIdx]);
          const itemName = parts[cols.itemNameIdx]?.trim();
          const qtyStr = parts[cols.qtyIdx]?.trim();
          const outletName =
            parts[cols.outletIdx]?.trim() ||
            (source.region === 'JABODETABEK' ? 'Outlet Jabodetabek' : 'Outlet Kalbar');

          if (!itemName) continue;

          const rowNo = parts[0]?.trim() || String(i);
          const effectiveRoId = (rawRoId && rawRoId !== '-' && rawRoId !== '0') ? rawRoId : `NOID-${source.region}-${rowNo}`;

          const qty = parseIndoQty(qtyStr);
          const unit = parts[cols.unitIdx]?.trim() || 'unit';
          const harga = parseIndoCurrency(parts[cols.hargaIdx]);
          const total = parseIndoCurrency(parts[cols.totalIdx]) || harga * qty;
          const tipeItem = parts[cols.tipeIdx]?.trim() || 'Perlengkapan Tetap';
          const sku = cols.skuIdx !== -1 ? parts[cols.skuIdx]?.trim() || '' : '';
          const inputDate = parts[cols.inputDateIdx]?.trim();
          const reqDate = parts[cols.reqDateIdx]?.trim();
          const warehouse = parts[cols.warehouseIdx]?.trim() || '-';
          const statusStr = parts[cols.statusIdx]?.trim() || 'Diproses';

          // Deduplikasi baris identik spreadsheet
          const fingerprint = `${source.region}::${effectiveRoId.toLowerCase().trim()}::${rowNo}::${itemName.toLowerCase().trim()}::${qty}`;
          if (seenFingerprints.has(fingerprint)) {
            duplicateRowsFiltered++;
            continue;
          }
          seenFingerprints.add(fingerprint);

          const roNumber = `RO-${effectiveRoId}`;
          if (isRoDeleted(roNumber) || isRoDeleted(effectiveRoId)) {
            continue;
          }
          const region: 'JABODETABEK' | 'KALBAR' = source.region;

          const parsedRequestDate = parseIndoDate(inputDate || reqDate) || new Date().toISOString().split('T')[0];
          const parsedTargetDate = parseIndoDate(reqDate || inputDate, true);

          if (options.startDate || options.endDate) {
            const targetDateForFilter =
              options.dateField === 'request_date'
                ? parsedTargetDate || parsedRequestDate
                : parsedRequestDate;
            if (!matchesRoDateRange(targetDateForFilter, options.startDate, options.endDate)) {
              continue;
            }
          }

          if (!groupedOrders.has(roNumber)) {
            groupedOrders.set(roNumber, {
              id: `ro-${effectiveRoId}`,
              ro_number: roNumber,
              raw_ro_id: effectiveRoId,
              branch_name: outletName,
              region,
              requester_name: `Logistik ${source.region === 'KALBAR' ? 'Kalbar' : 'Jabo'} via Spreadsheet`,
              request_date: parsedRequestDate,
              target_delivery_date: parsedTargetDate || undefined,
              status: 'INPUT_SYSTEM',
              current_stage: 'REQUEST_ORDER',
              source_type: 'GOOGLE_SHEET',
              warehouse_name: warehouse,
              items: [],
              created_at: new Date().toISOString(),
            });
          }

          groupedOrders.get(roNumber)!.items.push({
            id: `roi-${effectiveRoId}-${rowNo}-${groupedOrders.get(roNumber)!.items.length + 1}`,
            item_name: itemName,
            sku,
            unit,
            unit_price: harga,
            total_price: total,
            item_type: tipeItem,
            quantity_ordered: qty,
            quantity_fulfilled: 0,
            stock_source: 'ON_PROSES',
          });
        }
      } catch (sourceErr: any) {
        console.error(`[RO Sync] Error processing source ${source.name}:`, sourceErr);
      }
    }

    const uniqueOrders = Array.from(groupedOrders.values());
    let dbRowsWritten = 0;
    let totalItems = 0;
    uniqueOrders.forEach((o) => (totalItems += o.items.length));

    // Upsert into Supabase request_orders table with smart preservation of existing user progress
    if (admin && uniqueOrders.length > 0) {
      // PostgREST caps responses at 1000 rows, so page through all existing orders.
      // If any page fails we skip the DB write this cycle, otherwise existing orders
      // would be misclassified as new and their progress overwritten.
      let existingRows: any[] = [];
      let existingFetchOk = true;
      try {
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await admin
            .from('request_orders')
            .select('id, ro_number, raw_ro_id, branch_name, region, requester_name, request_date, target_delivery_date, status, current_stage, source_type, warehouse_name, notes, items')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          existingRows.push(...data);
          if (data.length < pageSize) break;
        }
      } catch (err) {
        existingFetchOk = false;
        console.warn('[RO Sync] Could not fetch existing orders for merge, skipping DB write:', err);
      }

      const existingMap = new Map<string, any>();
      for (const r of existingRows) {
        if (r.ro_number) existingMap.set(r.ro_number.toLowerCase().trim(), r);
        if (r.raw_ro_id) existingMap.set(String(r.raw_ro_id).toLowerCase().trim(), r);
      }

      const mergedOrders = uniqueOrders.map((o) => {
        const keyNo = (o.ro_number || '').toLowerCase().trim();
        const keyRaw = (o.raw_ro_id || '').toLowerCase().trim();
        const existing = existingMap.get(keyNo) || (keyRaw ? existingMap.get(keyRaw) : null);

        if (!existing) {
          return {
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
          };
        }

        // Merge items: preserve user-assigned stock_source / quantity_fulfilled
        const existingItemMap = new Map<string, any>();
        if (Array.isArray(existing.items)) {
          existing.items.forEach((it: any) => {
            const itemKey = (it.item_name || '').toLowerCase().trim();
            if (itemKey) existingItemMap.set(itemKey, it);
          });
        }

        const mergedItems = o.items.map((it) => {
          const matched = existingItemMap.get((it.item_name || '').toLowerCase().trim());
          if (matched && matched.stock_source && matched.stock_source !== 'ON_PROSES') {
            return {
              ...it,
              stock_source: matched.stock_source,
              quantity_fulfilled: matched.quantity_fulfilled ?? it.quantity_fulfilled,
              specification: matched.specification || it.specification,
            };
          }
          return it;
        });

        const isProcessed =
          (existing.notes && existing.notes.includes('[PROCESSED_FROM_RO]')) ||
          (existing.current_stage && existing.current_stage !== 'REQUEST_ORDER') ||
          (existing.status && existing.status !== 'INPUT_SYSTEM');

        return {
          id: existing.id,
          ro_number: o.ro_number,
          raw_ro_id: o.raw_ro_id,
          branch_name: o.branch_name,
          region: o.region,
          requester_name: o.requester_name,
          request_date: o.request_date,
          target_delivery_date: o.target_delivery_date || null,
          status: isProcessed ? existing.status : o.status,
          current_stage: isProcessed ? existing.current_stage : o.current_stage,
          notes: existing.notes || null,
          source_type: o.source_type,
          warehouse_name: o.warehouse_name,
          items: mergedItems,
        };
      });

      // Only write rows that are new or actually differ from the DB. New rows (no id) and
      // existing rows (with id) go in separate upserts so a mixed chunk never sends id: null.
      const existingById = new Map<string, any>();
      for (const r of existingRows) existingById.set(r.id, r);

      const newRows = mergedOrders.filter((o: any) => !o.id);
      const changedRows = mergedOrders.filter((o: any) => {
        if (!o.id) return false;
        const prev = existingById.get(o.id);
        return !prev || isRoRowChanged(prev, o);
      });

      const chunkSize = 100;
      const writeChunks = async (rows: any[], label: string) => {
        let ok = 0;
        const writeTimestamp = new Date().toISOString();
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows
            .slice(i, i + chunkSize)
            // updated_at ikut ditulis agar cache-signature di instance lain
            // mendeteksi perubahan hasil sync dan tidak menyajikan data lama.
            .map((row) => ({ ...row, updated_at: writeTimestamp }));
          const { error: upsertErr } = await admin
            .from('request_orders')
            .upsert(chunk, { onConflict: 'ro_number', defaultToNull: false });
          if (upsertErr) {
            console.error(`[RO Sync DB Error] ${label} chunk ${i}-${i + chunkSize}:`, upsertErr.message);
          } else {
            ok += chunk.length;
          }
        }
        return ok;
      };

      if (existingFetchOk) {
        const written = (await writeChunks(newRows, 'new')) + (await writeChunks(changedRows, 'update'));
        dbRowsWritten = written;
      }

      if (options.startDate || options.endDate) {
        invalidateRoCache();
      } else {
        const sortedMerged = sortOrdersNewestFirst(deduplicateOrderItems(mergedOrders as RequestOrder[]));
        cache.requestOrders = sortedMerged;
        global.__RO_CACHE__ = { items: sortedMerged, timestamp: Date.now() };
      }
    } else if (!options.startDate && !options.endDate) {
      const sortedUnique = sortOrdersNewestFirst(deduplicateOrderItems(uniqueOrders));
      cache.requestOrders = sortedUnique;
      global.__RO_CACHE__ = { items: sortedUnique, timestamp: Date.now() };
    }

    const rangeLabel =
      options.startDate || options.endDate
        ? ` [Filter ${options.dateField === 'request_date' ? 'Tgl Permintaan' : 'Tgl Order'}: ${options.startDate || 'Awal'} s/d ${options.endDate || 'Akhir'}]`
        : '';

    return {
      success: true,
      totalRowsScanned,
      duplicateRowsFiltered,
      uniqueOrdersCount: uniqueOrders.length,
      newOrdersAdded: totalItems,
      existingOrdersUpdated: 0,
      changed: dbRowsWritten > 0,
      message: `Sinkronisasi Multiregion (${syncedSources.join(' & ') || 'RO Sheet'})${rangeLabel} Berhasil! ${totalRowsScanned} baris dipindai, ${duplicateRowsFiltered} duplikat disaring. Ditemukan ${totalItems} item unik dalam ${uniqueOrders.length} dokumen RO.`,
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
      changed: false,
      message: err.message || 'Gagal menyinkronkan data RO dari spreadsheet.',
    };
  }
}

export async function cleanDuplicateRequestOrders(): Promise<{ cleanedCount: number; totalUnique: number }> {
  const admin = getAdminClient();
  const seenNumbers = new Set<string>();
  const uniqueOrders: RequestOrder[] = [];
  const duplicateIdsToDelete: string[] = [];
  let cleanedCount = 0;

  for (const ro of cache.requestOrders) {
    const rawKey = normalizeRoId(ro.raw_ro_id || ro.ro_number);
    const key = (rawKey || ro.id).toLowerCase();
    if (seenNumbers.has(key)) {
      cleanedCount++;
      if (ro.id) duplicateIdsToDelete.push(ro.id);
    } else {
      seenNumbers.add(key);
      const cleanRoNumber = rawKey ? `RO-${rawKey}` : ro.ro_number;
      const seenItemKeys = new Set<string>();
      const cleanItems = (ro.items || []).filter((it) => {
        const itemKey = `${it.item_name.toLowerCase().trim()}::${it.quantity_ordered}`;
        if (seenItemKeys.has(itemKey)) return false;
        seenItemKeys.add(itemKey);
        return true;
      });
      uniqueOrders.push({ ...ro, ro_number: cleanRoNumber, raw_ro_id: rawKey || ro.raw_ro_id, items: cleanItems });
    }
  }

  cache.requestOrders = uniqueOrders;
  invalidateRoCache();

  if (admin && duplicateIdsToDelete.length > 0) {
    try {
      const chunkSize = 50;
      for (let i = 0; i < duplicateIdsToDelete.length; i += chunkSize) {
        const chunk = duplicateIdsToDelete.slice(i, i + chunkSize);
        await admin.from('request_orders').delete().in('id', chunk);
      }
    } catch (err: any) {
      console.error('[cleanDuplicateRequestOrders DB delete error]:', err.message);
    }
  }

  return { cleanedCount, totalUnique: uniqueOrders.length };
}

const SJ_CACHE_TTL_MS = 5 * 60 * 1000;

function triggerSjFetch(): Promise<SuratJalan[]> {
  if (global.__SJ_PENDING__) {
    return global.__SJ_PENDING__;
  }

  global.__SJ_PENDING__ = (async () => {
    try {
      const admin = getAdminClient();
      let sjFromDb: SuratJalan[] = [];
      let fetchFailed = false;
      if (admin) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const { data, error } = await admin
            .from('surat_jalan')
            .select('*')
            .order('delivery_date', { ascending: false })
            .abortSignal(controller.signal);
          clearTimeout(timer);
          if (!error && Array.isArray(data)) {
            sjFromDb = data as SuratJalan[];
            global.__SJ_CACHE__ = { items: sjFromDb, timestamp: Date.now() };
          } else {
            fetchFailed = true;
          }
          if (error) console.error('[Supabase getSuratJalanList error]:', error.message);
        } catch (err: any) {
          fetchFailed = true;
          console.error('[Supabase getSuratJalanList exception]:', err.message);
        }
      }
      // Jika fetch GAGAL, kembalikan cache lama (bukan array kosong) dan
      // jangan reset timestamp-nya supaya percobaan berikutnya tetap ke DB.
      // Fetch sukses dengan 0 baris tetap dianggap valid (data memang kosong).
      if (fetchFailed && global.__SJ_CACHE__?.items?.length) {
        sjFromDb = global.__SJ_CACHE__.items;
      }
      if (!global.__SJ_CACHE__) {
        global.__SJ_CACHE__ = { items: sjFromDb, timestamp: Date.now() };
      }
      return sjFromDb;
    } finally {
      global.__SJ_PENDING__ = null;
    }
  })();

  return global.__SJ_PENDING__;
}

export async function getSuratJalanList(force = false): Promise<SuratJalan[]> {
  const now = Date.now();
  let sjFromDb: SuratJalan[];
  if (!force && global.__SJ_CACHE__ !== undefined) {
    if (now - global.__SJ_CACHE__.timestamp >= SJ_CACHE_TTL_MS && !global.__SJ_PENDING__) {
      void triggerSjFetch();
    }
    sjFromDb = global.__SJ_CACHE__.items;
  } else {
    sjFromDb = await triggerSjFetch();
  }

  let transfers: AssetTransfer[] = [];
  try {
    // Ikuti mode baca yang sama: data Surat Jalan dan Transfer saling
    // melengkapi, jadi keduanya harus segar saat halaman status dibuka.
    transfers = await getAssetTransfers(force);
  } catch (err: any) {
    console.error('[getSuratJalanList merge transfers error]:', err?.message);
  }

  const outlets = global.__OUTLETS_CACHE__?.items || cache.outlets;
  const requestOrders = global.__RO_CACHE__?.items || cache.requestOrders;
  const assets = global.__ASSET_REQUESTS_CACHE__?.items || cache.items;

  return mergeSuratJalanLists({
    dbSuratJalan: sjFromDb,
    cachedSuratJalan: cache.suratJalan || [],
    transfers,
    resolveRegion: (toLocation, explicitRegion) =>
      resolveTransferRegion({
        explicitRegion,
        toLocation,
        outlets,
        requestOrders,
        assets,
      }),
  });
}

export async function getSuratJalanById(id: string): Promise<SuratJalan | null> {
  const all = await getSuratJalanList(true);
  return all.find((sj) => sj.id === id || sj.sj_number === id) || null;
}

export async function createSuratJalan(payload: Partial<SuratJalan>): Promise<SuratJalan> {
  const admin = getAdminClient();
  const sjId = ensureUuid(payload.id);
  const roId = isUuid(payload.ro_id) ? payload.ro_id : null;

  const generatedSjNo = payload.sj_number || payload.nomor_sj || `SJ/SCGA/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${Date.now().toString().slice(-4)}`;
  const branch = payload.branch_name || payload.tujuan_outlet_nama || 'Outlet Tujuan';
  const roNo = payload.ro_number || payload.ro_nomor;
  const deliveryDate = payload.delivery_date || payload.tanggal_kirim || new Date().toISOString().split('T')[0];
  const driver = payload.driver_name || payload.driver_nama || 'Driver Pengantar';
  const vehicle = payload.vehicle_number || payload.kendaraan_plat || 'B 1234 SCG';
  const exped = payload.expedition || payload.ekspedisi || 'Armada Internal SCGA';
  const sender = payload.sender_name || payload.pengirim_nama || 'Staff Gudang SCGA';
  const receiver = payload.receiver_name || payload.penerima_nama;

  const resolvedRegion = resolveTransferRegion({
    explicitRegion: payload.region,
    toLocation: branch,
    outlets: global.__OUTLETS_CACHE__?.items || cache.outlets,
    requestOrders: global.__RO_CACHE__?.items || cache.requestOrders,
    assets: global.__ASSET_REQUESTS_CACHE__?.items || cache.items,
  });

  const normalizedItems = (payload.items || []).map((it: any) => {
    const name = it.nama_barang || it.item_name || it.name || it.system_item_name || 'Barang Aset';
    const quantity = it.qty ?? it.quantity ?? it.quantity_ordered ?? it.quantity_needed ?? 1;
    const unit = it.satuan || it.unit || 'Unit';
    const notes = it.catatan || it.notes || it.specification || '';
    return {
      ...it,
      nama_barang: name,
      item_name: name,
      qty: quantity,
      quantity: quantity,
      satuan: unit,
      unit: unit,
      catatan: notes,
      notes: notes,
    };
  });

  const sj: SuratJalan = {
    id: sjId,
    sj_number: generatedSjNo,
    nomor_sj: generatedSjNo,
    ro_id: roId || undefined,
    ro_number: roNo,
    ro_nomor: roNo,
    branch_name: branch,
    tujuan_outlet_nama: branch,
    region: resolvedRegion,
    delivery_date: deliveryDate,
    tanggal_kirim: deliveryDate,
    driver_name: driver,
    driver_nama: driver,
    driver_phone: payload.driver_phone,
    vehicle_number: vehicle,
    kendaraan_plat: vehicle,
    expedition: exped,
    ekspedisi: exped,
    sender_name: sender,
    pengirim_nama: sender,
    receiver_name: receiver,
    penerima_nama: receiver,
    status: payload.status || 'SHIPPED',
    items: normalizedItems,
    notes: payload.notes || payload.catatan,
    catatan: payload.catatan || payload.notes,
    created_at: new Date().toISOString(),
  };

  if (admin) {
    try {
      const dbPayload = sanitizeSuratJalanDbPayload({
        ...sj,
        ro_id: roId,
      });
      const { data, error } = await writeRowResilient('surat_jalan', dbPayload, { onConflict: 'id' });
      if (error) {
        console.error('[Supabase createSuratJalan error]:', error);
      } else if (data) {
        const saved = { ...sj, ...(data as SuratJalan), region: resolvedRegion };
        cache.suratJalan = [saved, ...cache.suratJalan.filter((s) => s.id !== saved.id)];
        invalidateSjCache();
        return saved;
      }
    } catch (err: any) {
      console.error('[Supabase createSuratJalan exception]:', err.message);
    }
  }

  cache.suratJalan = [sj, ...cache.suratJalan.filter((s) => s.id !== sj.id)];
  invalidateSjCache();
  return sj;
}

export interface SuratJalanProofOptions {
  receiverName?: string;
  signatureUrl?: string;
  photoUrl?: string;
  notes?: string;
}

export async function updateSuratJalanStatus(
  idOrIds: string | string[],
  status: 'SHIPPED' | 'DELIVERED',
  proof?: string | SuratJalanProofOptions
): Promise<boolean> {
  const admin = getAdminClient();
  const targetIds = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
  if (targetIds.length === 0) return false;

  const options: SuratJalanProofOptions =
    typeof proof === 'string' ? { receiverName: proof } : proof || {};

  const nowIso = new Date().toISOString();
  const nowDate = nowIso.split('T')[0];

  // Ambil daftar SJ & Transfer TERBARU untuk mengekstrak seluruh item &
  // referensi RO. Memakai cache bisa menulis balik items/status lama dan
  // menimpa perubahan yang baru disimpan instance lain.
  const allSj = await getSuratJalanList(true);
  const targetSet = new Set(targetIds.map((x) => x.toLowerCase()));
  const matchedDocs = allSj.filter(
    (s) =>
      targetSet.has((s.id || '').toLowerCase()) ||
      (s.sj_number && targetSet.has(s.sj_number.toLowerCase())) ||
      (s.nomor_sj && targetSet.has(s.nomor_sj.toLowerCase()))
  );

  const findDoc = (id: string) => {
    const key = id.toLowerCase();
    return allSj.find(
      (s) =>
        (s.id || '').toLowerCase() === key ||
        (s.sj_number || '').toLowerCase() === key ||
        (s.nomor_sj || '').toLowerCase() === key
    );
  };

  let anySjDbUpdated = false;

  for (const id of targetIds) {
    const existingDoc = findDoc(id);
    const normalizedItems = existingDoc?.items
      ? status === 'DELIVERED'
        ? normalizeConfirmedSjItems(existingDoc.items, {
            signatureUrl: options.signatureUrl,
            photoUrl: options.photoUrl,
          })
        : existingDoc.items
      : undefined;

    const updateData: any = {
      status,
      updated_at: nowIso,
      ...(normalizedItems ? { items: normalizedItems } : {}),
    };

    if (options.receiverName) {
      updateData.receiver_name = options.receiverName;
      updateData.penerima_nama = options.receiverName;
    }
    if (options.signatureUrl) {
      updateData.tanda_tangan_url = options.signatureUrl;
    }
    if (options.photoUrl) {
      updateData.foto_bukti_url = options.photoUrl;
    }
    if (options.notes) {
      updateData.catatan_penerimaan = options.notes;
    }
    if (status === 'DELIVERED') {
      updateData.received_at = nowIso;
      updateData.waktu_diterima = nowIso;
    }

    if (admin) {
      // A. Update di tabel surat_jalan. Payload dibersihkan lebih dulu agar
      //    tidak ada round-trip yang pasti gagal karena kolom tidak ada di DB.
      try {
        const sjDbPayload = sanitizeSuratJalanDbPayload({
          ...updateData,
          updated_at: nowIso,
        });
        let q = admin.from('surat_jalan').update(sjDbPayload);
        q = isUuid(id) ? q.eq('id', id) : q.eq('sj_number', id);
        const { error } = await q;
        if (error) {
          console.error('[Supabase updateSuratJalanStatus sj error]:', error.message);
        } else {
          anySjDbUpdated = true;
        }
      } catch (err: any) {
        console.error('[Supabase updateSuratJalanStatus sj exception]:', err.message);
      }

      // B. Update juga di tabel asset_transfers (Surat Jalan dari Pemantauan
      //    Distribusi tersimpan di sana). Hanya kolom yang benar-benar ada.
      try {
        const transferUpdate = sanitizeAssetTransferDbPayload({
          status: status === 'DELIVERED' ? 'RECEIVED' : 'IN_TRANSIT',
          ...(options.receiverName ? { receiver_pic: options.receiverName } : {}),
          ...(normalizedItems ? { items: normalizedItems } : {}),
          updated_at: nowIso,
        });

        // id dokumen SJ dan asset_transfers dibuat sama saat distribusi,
        // jadi id UUID bisa dipakai langsung. Untuk nomor dokumen, pakai
        // transfer_number (satu-satunya kolom referensi yang ada di DB).
        const transferRef = isUuid(id)
          ? id
          : existingDoc?.id && isUuid(existingDoc.id)
            ? existingDoc.id
            : null;

        let tq = admin.from('asset_transfers').update(transferUpdate);
        tq = transferRef ? tq.eq('id', transferRef) : tq.eq('transfer_number', id);
        const { error: tErr } = await tq;
        if (tErr) {
          console.error('[Supabase updateSuratJalanStatus transfer error]:', tErr.message);
        }
      } catch (err: any) {
        console.error('[Supabase updateSuratJalanStatus transfer exception]:', err.message);
      }
    }

    // Update in-memory caches
    const sjIdx = cache.suratJalan.findIndex((sj) => sj.id === id || sj.sj_number === id || sj.nomor_sj === id);
    if (sjIdx !== -1) {
      cache.suratJalan[sjIdx] = {
        ...cache.suratJalan[sjIdx],
        ...updateData,
        status,
      };
    } else if (existingDoc) {
      cache.suratJalan.unshift({
        ...existingDoc,
        ...updateData,
        status,
      });
    }

    const trIdx = cache.transfers.findIndex(
      (t) => t.id === id || t.surat_jalan_number === id || t.transfer_number === id
    );
    if (trIdx !== -1) {
      cache.transfers[trIdx] = {
        ...cache.transfers[trIdx],
        status: status === 'DELIVERED' ? 'RECEIVED' : 'IN_TRANSIT',
        ...(options.receiverName ? { receiver_pic: options.receiverName } : {}),
        ...(status === 'DELIVERED' ? { received_date: nowDate } : {}),
        ...(options.notes ? { received_notes: options.notes } : {}),
        ...(options.signatureUrl ? { tanda_tangan_url: options.signatureUrl } : {}),
        ...(options.photoUrl ? { foto_bukti_url: options.photoUrl } : {}),
        ...(normalizedItems ? { items: normalizedItems } : {}),
      } as AssetTransfer;
    }
  }

  invalidateTransfersCache();
  invalidateSjCache();

  // C. Jika status === 'DELIVERED', selesaikan seluruh item terkait pada Request Order (RO) sekaligus
  if (status === 'DELIVERED' && matchedDocs.length > 0) {
    try {
      const allRos = await getRequestOrders(true);
      const combinedItems = matchedDocs.flatMap((d) => d.items || []);
      const roNumbers = matchedDocs
        .map((d) => d.ro_nomor || d.ro_number || '')
        .filter(Boolean);
      const outletName =
        matchedDocs[0]?.tujuan_outlet_nama || matchedDocs[0]?.branch_name || '';

      const roPatches = applyConfirmedItemsToRequestOrders(
        allRos,
        combinedItems,
        outletName,
        {
          receivedDate: nowDate,
          receiverName: options.receiverName || 'PIC Cabang',
          notes: options.notes,
          roNumbers,
        }
      );

      for (const patch of roPatches) {
        await updateRequestOrder(patch.id, patch.updates as any);
      }
    } catch (err: any) {
      console.error('[updateSuratJalanStatus RO batch sync error]:', err?.message);
    }
  }

  return !admin || anySjDbUpdated;
}

export async function deleteSuratJalan(id: string): Promise<boolean> {
  const admin = getAdminClient();
  let deletedFromDb = false;

  if (admin) {
    try {
      if (isUuid(id)) {
        const { error: sjErr } = await admin.from('surat_jalan').delete().eq('id', id);
        if (sjErr) console.error('[Supabase deleteSuratJalan sj error]:', sjErr.message);
        else deletedFromDb = true;

        const { error: trErr } = await admin.from('asset_transfers').delete().eq('id', id);
        if (trErr) console.error('[Supabase deleteSuratJalan transfer error]:', trErr.message);
      } else {
        const { error: sjErr } = await admin.from('surat_jalan').delete().eq('sj_number', id);
        if (sjErr) console.error('[Supabase deleteSuratJalan sj error]:', sjErr.message);
        else deletedFromDb = true;

        // asset_transfers tidak punya kolom surat_jalan_number; relasi hanya
        // bisa lewat id (dibuat sama) atau transfer_number.
        const { data: matchedTransfers, error: findErr } = await admin
          .from('asset_transfers')
          .select('id')
          .eq('transfer_number', id);
        if (findErr) {
          console.error('[Supabase deleteSuratJalan transfer lookup error]:', findErr.message);
        }
        for (const row of matchedTransfers || []) {
          const { error: trErr } = await admin.from('asset_transfers').delete().eq('id', (row as any).id);
          if (trErr) console.error('[Supabase deleteSuratJalan transfer error]:', trErr.message);
        }
      }
    } catch (e: any) {
      console.error('[Supabase deleteSuratJalan error]:', e?.message);
    }
  }

  if (cache.suratJalan) {
    cache.suratJalan = cache.suratJalan.filter((s) => s.id !== id && s.sj_number !== id);
  }
  if (cache.transfers) {
    cache.transfers = cache.transfers.filter(
      (t) => t.id !== id && t.surat_jalan_number !== id && t.transfer_number !== id
    );
  }
  invalidateTransfersCache();
  invalidateSjCache();
  return !admin || deletedFromDb;
}

export async function clearAllSuratJalan(): Promise<{ count: number }> {
  const admin = getAdminClient();
  let count = 0;

  if (cache.suratJalan) {
    count += cache.suratJalan.length;
    cache.suratJalan = [];
  }
  if (cache.transfers) {
    count += cache.transfers.length;
    cache.transfers = [];
  }
  invalidateTransfersCache();
  invalidateSjCache();

  if (admin) {
    try {
      const [sjRes, trRes] = await Promise.all([
        admin.from('surat_jalan').select('id'),
        admin.from('asset_transfers').select('id')
      ]);
      if (sjRes.data && sjRes.data.length > 0) {
        count = Math.max(count, sjRes.data.length);
        const { error } = await admin.from('surat_jalan').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.error('[Supabase clearAllSuratJalan error]:', error.message);
      }
      if (trRes.data && trRes.data.length > 0) {
        count += trRes.data.length;
        const { error: trErr } = await admin.from('asset_transfers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (trErr) console.error('[Supabase clearAllSuratJalan transfers error]:', trErr.message);
      }
    } catch (err: any) {
      console.error('[Supabase clearAllSuratJalan exception]:', err?.message);
    }
  }

  return { count };
}



// ==============================================================================
// 4. DISPOSISI: PENGEMBALIAN ASET
// ==============================================================================
export async function getDispositionRequests(): Promise<DispositionRequest[]> {
  const admin = getAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.from('disposition_requests').select('*').order('submission_date', { ascending: false });
      // DB yang sukses (termasuk hasil kosong) adalah sumber kebenaran.
      if (!error && Array.isArray(data)) return data as DispositionRequest[];
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
      const { data, error } = await q.select('id');
      if (error) {
        console.error('[Supabase updateDispositionStatus error]:', error.message);
        return false;
      }
      if ((data?.length || 0) === 0) {
        console.error('[Supabase updateDispositionStatus] Tidak ada baris yang diperbarui untuk', id);
        return false;
      }
    } catch (err: any) {
      console.error('[Supabase updateDispositionStatus exception]:', err.message);
      return false;
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

export async function getPurchaseRequirementItems(
  region: RegionType = 'ALL',
  includeCompleted = false
): Promise<AssetRequest[]> {
  // Halaman PR menampilkan data yang bisa diedit user, jadi selalu baca DB
  // terbaru. Cache in-memory per-instance (TTL 5 menit) membuat status yang
  // baru disimpan di instance lain terlihat "kembali ke awal".
  const { data: allItems } = await getAssetRequests({ region, limit: 5000, fresh: true });
  const sheetPrItems = allItems.filter((it) =>
    matchesPurchaseRequirementFilter(it, includeCompleted)
  );

  // Fetch RO items that require PR (stock_source === 'PR_VENDOR')
  const roOrders = await getRequestOrders(true);
  const roPrItems: AssetRequest[] = [];
  const seenIds = new Set<string>(sheetPrItems.map((it) => it.id));

  for (const ro of roOrders) {
    if (ro.status === 'REJECTED' || (ro.status as string) === 'CANCELLED' || ro.current_stage === 'DIBATALKAN') continue;
    if (region !== 'ALL' && ro.region !== region) continue;

    const prItems = (ro.items || []).filter((it) => it.stock_source === 'PR_VENDOR');
    for (const it of prItems) {
      const itemId = `ro-pr-${ro.id}-${it.id || encodeURIComponent(it.item_name)}`;
      if (seenIds.has(itemId)) continue;
      seenIds.add(itemId);

      const manualEdit = cache.manualEdits?.get(itemId);
      const isCompleted = ro.current_stage === 'READY_STOCK' || ro.status === 'READY_STOCK' || ro.current_stage === 'SELESAI';
      const storedProcStatus = (manualEdit?.procurement_status || it.procurement_status) as
        | 'selesai'
        | 'proses'
        | 'belum'
        | 'po'
        | undefined;
      const procStatus: 'selesai' | 'proses' | 'belum' | 'po' = isCompleted
        ? 'selesai'
        : storedProcStatus || (ro.pr_po_number ? 'po' : 'belum');

      const assetReq: AssetRequest = {
        id: itemId,
        external_id: ro.ro_number,
        region: ro.region === 'KALBAR' ? 'KALBAR' : 'JABODETABEK',
        sheet_row_index: 0,
        order_datetime: ro.target_delivery_date || ro.request_date || ro.created_at || new Date().toISOString(),
        requester_name: ro.requester_name || 'Outlet Staff',
        requester_division: 'Logistik RO',
        category: 'Perlengkapan RO',
        branch_name: ro.branch_name,
        classification: it.item_type || 'Aset RO',
        item_name: it.item_name,
        system_item_name: it.item_name || '',
        specification: (it as any).specification || getItemSpecification(it.item_name) || '',
        photo_url: (it as any).photo_url || getItemImageUrl(it.item_name) || null,
        quantity_needed: it.quantity_ordered,
        rab_number: ro.ro_number,
        rab_link: '',
        rab_price: it.unit_price || 0,
        rab_total: it.total_price || (it.unit_price || 0) * it.quantity_ordered,
        acc_kadiv_request: true,
        stock_status: 'Not Ready (Stok Kosong)',
        quantity_stock_allocated: 0,
        quantity_pr: it.quantity_ordered,
        opening_date: ro.target_delivery_date || null,
        pr_datetime: ro.created_at || new Date().toISOString(),
        is_direct_shipment: false,
        po_date: ro.pr_po_number ? (ro.created_at || null) : null,
        order_type: 'INTERNAL',
        vendor_name: ro.pr_vendor_name || '',
        initial_price: it.unit_price || 0,
        deal_price: it.unit_price || 0,
        realized_price: it.total_price || 0,
        negotiation_proof: null,
        acc_kadiv_procurement: false,
        procurement_status: procStatus,
        item_delivery_status: isCompleted ? 'Ready Gudang SCGA' : 'On Proses',
        received_date: ro.arrival_datetime || null,
        lead_time_days: 0,
        pic_receiver: ro.pic_receiver || '',
        notes: it.notes || `Sumber dari Request Order ${ro.ro_number}`,
        item_notes: it.notes || '',
        is_manually_edited: false,
        created_at: ro.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(manualEdit || {}),
      };

      roPrItems.push(assetReq);
    }
  }

  return [...roPrItems, ...sheetPrItems];
}

export async function getPurchaseRequirementHistory(
  region: RegionType = 'ALL'
): Promise<AssetRequest[]> {
  const items = await getPurchaseRequirementItems(region, true);
  return filterPurchaseRequirementHistory(items);
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
  'https://docs.google.com/spreadsheets/d/1ie4cLxARxPHDSwH-rERxYbxbmk99mQPMHy2wJUOgpIQ/export?format=csv&gid=529914403';
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

    // Muat foto dan spesifikasi langsung dari tabel Database Supabase (asset_requests) & Storage
    const dbImages: Record<string, string> = {};
    const dbSpecs: Record<string, string> = {};
    const supabaseManifest: Record<string, string> = {};
    const supabaseSpecs: Record<string, string> = {};
    const admin = getAdminClient();
    if (admin) {
      try {
        const [manifestRes, specRes, dbItemsRes] = await Promise.all([
          admin.storage.from('item-images').download('manifest.json'),
          admin.storage.from('item-images').download('item-specifications.json'),
          admin
            .from('asset_requests')
            .select('item_name, system_item_name, photo_url, specification')
            .or('photo_url.not.is.null,specification.not.is.null'),
        ]);

        if (manifestRes.data) {
          const text = await manifestRes.data.text();
          Object.assign(supabaseManifest, JSON.parse(text));
        }
        if (specRes.data) {
          const text = await specRes.data.text();
          Object.assign(supabaseSpecs, JSON.parse(text));
        }
        if (dbItemsRes.data && Array.isArray(dbItemsRes.data)) {
          for (const row of dbItemsRes.data) {
            const name = (row.item_name || row.system_item_name)?.trim();
            if (name) {
              const lower = name.toLowerCase();
              if (row.photo_url) {
                dbImages[name] = row.photo_url;
                dbImages[lower] = row.photo_url;
                setItemImageOverride(name, row.photo_url);
              }
              if (row.specification) {
                dbSpecs[name] = row.specification;
                dbSpecs[lower] = row.specification;
                setItemSpecificationOverride(name, row.specification);
              }
            }
          }
        }
      } catch (storageErr) {
        console.warn('[Supabase Database / Storage] Gagal mengunduh data:', storageErr);
      }
    }

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

      // Prioritas 1: Ambil foto dari Supabase Database (asset_requests), Storage manifest, atau local helper
      const rawLower = rawName.toLowerCase();
      let photoUrl: string | null =
        dbImages[rawName] ||
        dbImages[rawLower] ||
        supabaseManifest[rawName] ||
        supabaseManifest[rawLower] ||
        getItemImageUrl(rawName);

      const customSpec =
        dbSpecs[rawName] !== undefined
          ? dbSpecs[rawName]
          : dbSpecs[rawLower] !== undefined
          ? dbSpecs[rawLower]
          : supabaseSpecs[rawName] !== undefined
          ? supabaseSpecs[rawName]
          : getItemSpecification(rawName);
      let specification = customSpec !== null && customSpec !== undefined ? customSpec : (specRaw || '');

      if (!photoUrl) {
        if (imgRaw && (imgRaw.startsWith('http') || imgRaw.includes('drive.google.com'))) {
          photoUrl = imgRaw;
        } else if (specRaw && (specRaw.startsWith('http') && (specRaw.includes('drive.google.com') || /\.(png|jpe?g|webp|gif)/i.test(specRaw)))) {
          photoUrl = specRaw;
          specification = '';
        }
      }

      // Convert Google Drive view links to direct image preview links
      if (photoUrl && photoUrl.includes('drive.google.com')) {
        const driveMatch = photoUrl.match(/(?:file\/d\/|open\?id=|id=)([a-zA-Z0-9_-]{20,})/);
        if (driveMatch && driveMatch[1]) {
          photoUrl = `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w800`;
        }
      }

      if (photoUrl) {
        setItemImageOverride(rawName, photoUrl);
      }
      if (customSpec) {
        setItemSpecificationOverride(rawName, customSpec);
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

    // Also supplement with any items from the RO sheets (KALBAR & JABO) so no requested item is missing
    for (const roSrc of RO_SOURCES) {
      try {
        const roResponse = await fetch(roSrc.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (roResponse.ok) {
          const roCsvText = await roResponse.text();
          const roLines = roCsvText.split('\n');
          if (roLines.length > 1) {
            const cols = detectRoColumns(roLines[0], roSrc.region);
            for (let i = 1; i < roLines.length; i++) {
              const rLine = roLines[i];
              if (!rLine.trim()) continue;
              const rCols = parseCSVLine(rLine);
              const rItemName = rCols[cols.itemNameIdx]?.trim();
              if (!rItemName) continue;
              const rKey = rItemName.toLowerCase();
              if (!seenNames.has(rKey)) {
                seenNames.add(rKey);
                const rUnit = rCols[cols.unitIdx]?.trim() || 'unit';
                const rTipe = rCols[cols.tipeIdx]?.trim() || 'Perlengkapan Tetap';
                classifications.add(rTipe);

                const rPhoto =
                  dbImages[rItemName] ||
                  dbImages[rKey] ||
                  supabaseManifest[rItemName] ||
                  supabaseManifest[rKey] ||
                  getItemImageUrl(rItemName) ||
                  null;

                const rSpec =
                  dbSpecs[rItemName] !== undefined
                    ? dbSpecs[rItemName]
                    : dbSpecs[rKey] !== undefined
                    ? dbSpecs[rKey]
                    : supabaseSpecs[rItemName] !== undefined
                    ? supabaseSpecs[rItemName]
                    : getItemSpecification(rItemName) || '';

                if (rPhoto) setItemImageOverride(rItemName, rPhoto);
                if (rSpec) setItemSpecificationOverride(rItemName, rSpec);

                items.push({
                  id: `mat-ro-${items.length + 1}`,
                  item_name: rItemName,
                  system_item_name: rItemName,
                  unit: rUnit,
                  classification: rTipe,
                  specification: rSpec,
                  photo_url: rPhoto,
                  standard_rab_price: parseIndoCurrency(rCols[cols.hargaIdx]),
                  total_requests: 1,
                  total_units_needed: 1,
                  is_new_item: true,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Could not supplement master catalog with items from ${roSrc.name}:`, e);
      }
    }

    // Pastikan seluruh entri master item yang ada di tabel Supabase Database (asset_requests) juga masuk ke katalog
    if (admin) {
      try {
        const { data: dbCustomItems } = await admin
          .from('asset_requests')
          .select('item_name, system_item_name, classification, specification, photo_url, rab_price')
          .ilike('external_id', 'MASTER-%');

        if (dbCustomItems && Array.isArray(dbCustomItems)) {
          for (const cItem of dbCustomItems) {
            const cName = (cItem.item_name || cItem.system_item_name)?.trim();
            if (!cName) continue;
            const cKey = cName.toLowerCase();
            if (!seenNames.has(cKey)) {
              seenNames.add(cKey);
              const cClass = cItem.classification || 'Perlengkapan Tetap';
              classifications.add(cClass);
              items.push({
                id: `mat-db-${items.length + 1}`,
                item_name: cName,
                system_item_name: cName,
                unit: 'unit',
                classification: cClass,
                specification: cItem.specification || dbSpecs[cKey] || '',
                photo_url: cItem.photo_url || dbImages[cKey] || null,
                standard_rab_price: Number(cItem.rab_price) || 0,
                total_requests: 1,
                total_units_needed: 1,
                is_new_item: true,
              });
            }
          }
        }
      } catch (dbErr) {
        console.warn('Could not supplement catalog with custom DB items:', dbErr);
      }
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

export function updateCachedMasterItem(
  itemName: string,
  updates: { photoUrl?: string | null; specification?: string }
) {
  if (!itemName) return;
  const targetLower = itemName.toLowerCase().trim();

  if (updates.photoUrl) {
    setItemImageOverride(itemName, updates.photoUrl);
  }
  if (updates.specification !== undefined) {
    setItemSpecificationOverride(itemName, updates.specification);
  }

  if (cachedMasterCatalog) {
    const found = cachedMasterCatalog.find((it) => it.item_name.toLowerCase().trim() === targetLower);
    if (found) {
      if (updates.photoUrl !== undefined) found.photo_url = updates.photoUrl;
      if (updates.specification !== undefined) found.specification = updates.specification;
    }
  }
}

export function invalidateMasterCatalogCache() {
  cachedMasterCatalog = null;
  masterCatalogLastFetched = 0;
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
  const completedItems = items.filter((it) => (it.item_delivery_status || '').toLowerCase().includes('terima outlet') || (it.item_delivery_status || '').toLowerCase().includes('lengkap'));
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
