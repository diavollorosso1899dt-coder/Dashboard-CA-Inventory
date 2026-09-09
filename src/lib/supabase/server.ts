import { createClient } from '@supabase/supabase-js';
import { AssetRequest, DashboardMetrics, BranchOpeningSummary, SyncLog, RegionType } from './types';
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
  } | undefined;
}

if (!global.__LOCAL_ASSET_CACHE__) {
  global.__LOCAL_ASSET_CACHE__ = {
    items: [],
    lastSynced: null,
    lastContentHash: null,
    syncLogs: [],
    manualEdits: new Map(),
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
