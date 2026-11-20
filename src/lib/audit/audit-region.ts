import type { AuditLogEntry } from '@/lib/supabase/types';
import { getAdminClient } from '@/lib/supabase/server';
import {
  createEmptyAuditRegionLookups,
  resolveAuditLogRegion,
  type AuditRegionEntity,
  type AuditRegionLookups,
} from './audit-region-core';

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: string,
  columns: string
): Promise<T[]> {
  const admin = getAdminClient();
  if (!admin) return [];

  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn(`[audit-region] Gagal ambil ${table}:`, error.message);
      break;
    }

    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function putByKey(
  map: Map<string, AuditRegionEntity>,
  key: string | null | undefined,
  row: AuditRegionEntity
) {
  const normalized = String(key ?? '').trim().toUpperCase();
  if (normalized) map.set(normalized, row);
}

/**
 * Ambil referensi entitas yang dibutuhkan untuk memetakan region audit log.
 * Sengaja tidak memakai cache agar log baru langsung terpetakan.
 */
export async function buildAuditRegionLookups(): Promise<AuditRegionLookups> {
  const lookups = createEmptyAuditRegionLookups();
  if (!getAdminClient()) return lookups;

  const [requestOrders, assetRequests, suratJalan, outlets, users] = await Promise.all([
    fetchAllRows<AuditRegionEntity & { id: string; ro_number?: string }>(
      'request_orders',
      'id,ro_number,branch_name,region'
    ),
    fetchAllRows<AuditRegionEntity & { id: string }>(
      'asset_requests',
      'id,branch_name,region'
    ),
    fetchAllRows<AuditRegionEntity & { id: string; sj_number?: string }>(
      'surat_jalan',
      'id,sj_number,branch_name,region'
    ),
    fetchAllRows<AuditRegionEntity & { id: string; branch_name?: string }>(
      'outlets',
      'id,branch_name,region'
    ),
    fetchAllRows<AuditRegionEntity & { id: string; email?: string }>(
      'user_profiles',
      'id,email,branch_name'
    ),
  ]);

  for (const row of requestOrders) {
    if (row.id) lookups.roById.set(row.id, row);
    putByKey(lookups.roByNumber, row.ro_number, row);
  }

  for (const row of assetRequests) {
    if (row.id) lookups.assetRequestById.set(row.id, row);
  }

  for (const row of suratJalan) {
    if (row.id) lookups.sjById.set(row.id, row);
    putByKey(lookups.sjByNumber, row.sj_number, row);
  }

  for (const row of outlets) {
    if (row.id) lookups.outletById.set(row.id, row);
    putByKey(lookups.outletByBranch, row.branch_name, row);
  }

  for (const row of users) {
    if (row.id) lookups.userById.set(row.id, row);
    if (row.email) lookups.userByEmail.set(row.email.toLowerCase(), row);
  }

  return lookups;
}

/** Tempelkan field `region` hasil resolve ke setiap log. */
export async function attachAuditLogRegions(
  logs: AuditLogEntry[]
): Promise<AuditLogEntry[]> {
  if (logs.length === 0) return logs;

  const lookups = await buildAuditRegionLookups();
  return logs.map((log) => ({
    ...log,
    region: resolveAuditLogRegion(log, lookups),
  }));
}
