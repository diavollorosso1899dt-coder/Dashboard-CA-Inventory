import type { AssetRequest, RegionType, RequestOrder, ROItem } from '@/lib/supabase/types';
import {
  getAdminClient,
  invalidateAssetRequestsCache,
  invalidateRoCache,
  updateRequestOrder,
} from '@/lib/supabase/server';
import { moveItemToTrash, recordAuditLog } from '@/lib/audit/audit-store';

export interface RegionPrResetFailure {
  id: string;
  itemName: string;
  error: string;
}

export interface RegionPrResetResult {
  success: boolean;
  region: RegionType;
  trashedAssetRequests: number;
  deletedAssetRequests: number;
  resetRoItems: number;
  updatedRequestOrders: string[];
  failedAssetRequests: RegionPrResetFailure[];
  errors: string[];
}

const RESETTABLE_REGIONS: RegionType[] = ['JABODETABEK', 'KALBAR'];
const PAGE_SIZE = 1000;

/**
 * Item RO dianggap bagian dari data PR bila masih menunggu vendor, sudah
 * dijadwalkan datang, atau sudah ditandai tiba di gudang. Kriteria ini sama
 * dengan reset PR all-region yang sudah ada.
 */
function isPrItem(item: ROItem): boolean {
  return (
    item.stock_source === 'PR_VENDOR' ||
    Boolean(item.procurement_status) ||
    Boolean(item.pr_arrival_date) ||
    (item.stock_source === 'GUDANG_SCGA' && item.is_arrived_at_warehouse === true)
  );
}

function resetPrFields(items: ROItem[]): { items: ROItem[]; resetCount: number } {
  let resetCount = 0;

  const nextItems = items.map((item) => {
    if (!isPrItem(item)) return item;

    resetCount += 1;
    const copy: Record<string, any> = { ...item };
    if (copy.stock_source === 'PR_VENDOR') {
      copy.stock_source = 'ON_PROSES';
    }
    delete copy.procurement_status;
    delete copy.pr_arrival_date;
    delete copy.is_arrived_at_warehouse;
    return copy as ROItem;
  });

  return { items: nextItems, resetCount };
}

async function fetchRegionOrders(region: RegionType): Promise<RequestOrder[]> {
  const admin = getAdminClient();
  if (!admin) throw new Error('Koneksi Supabase tidak tersedia.');

  const orders: RequestOrder[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('request_orders')
      .select('*')
      .eq('region', region)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Gagal membaca request_orders region ${region}: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    orders.push(...(data as RequestOrder[]));
    if (data.length < PAGE_SIZE) break;
  }

  return orders;
}

/**
 * Pindahkan seluruh asset_requests sebuah region ke Tempat Sampah, lalu reset
 * item PR pada RO region tersebut. Region lain tidak disentuh.
 *
 * Setiap baris aset dicatat sebagai DELETE_TO_TRASH sehingga masih bisa
 * dipulihkan satu per satu dari halaman Tempat Sampah. Reset item RO dicatat
 * sebagai STATUS_CHANGE agar bisa dikembalikan lewat Audit Log.
 */
export async function trashPurchaseRequirementsByRegion(
  region: RegionType,
  actorName: string = 'Super User',
  actorRole: string = 'Super User'
): Promise<RegionPrResetResult> {
  if (!RESETTABLE_REGIONS.includes(region)) {
    throw new Error('Reset per region hanya mendukung JABODETABEK atau KALBAR.');
  }

  const admin = getAdminClient();
  if (!admin) throw new Error('Koneksi Supabase tidak tersedia.');

  const result: RegionPrResetResult = {
    success: true,
    region,
    trashedAssetRequests: 0,
    deletedAssetRequests: 0,
    resetRoItems: 0,
    updatedRequestOrders: [],
    failedAssetRequests: [],
    errors: [],
  };

  // -------------------------------------------------------------------
  // 1. ASSET REQUESTS -> TEMPAT SAMPAH
  // -------------------------------------------------------------------
  const { data: assetRows, error: assetError } = await admin
    .from('asset_requests')
    .select('*')
    .eq('region', region)
    .order('created_at', { ascending: true });

  if (assetError) {
    throw new Error(`Gagal membaca asset_requests region ${region}: ${assetError.message}`);
  }

  const startedAt = new Date().toISOString();

  for (const row of (assetRows || []) as AssetRequest[]) {
    const title = row.item_name || 'Data PR';
    const subtitle = `${row.branch_name || 'Cabang'} • ${row.rab_number || 'RAB'}`;
    let trashItemId: string | null = null;

    try {
      const trashItem = await moveItemToTrash(
        'ASET',
        row.id,
        title,
        subtitle,
        row,
        actorName,
        actorRole,
        `Reset data PR region ${region}`
      );
      trashItemId = trashItem.id;

      // moveItemToTrash menelan error insert DB. Verifikasi ulang supaya baris
      // aktif tidak dihapus saat snapshot sampah gagal tersimpan.
      const { data: persistedTrash, error: verifyError } = await admin
        .from('trash_items')
        .select('id')
        .eq('id', trashItem.id)
        .maybeSingle();

      if (verifyError || !persistedTrash) {
        throw new Error(verifyError?.message || 'Gagal menyimpan item ke Tempat Sampah.');
      }

      const { data: deleted, error: deleteError } = await admin
        .from('asset_requests')
        .delete()
        .eq('id', row.id)
        .select('id');

      if (deleteError) throw new Error(deleteError.message);
      if (!deleted || deleted.length === 0) {
        throw new Error('Baris asset_requests tidak terhapus dari tabel aktif.');
      }

      result.trashedAssetRequests += 1;
      result.deletedAssetRequests += 1;
    } catch (err: any) {
      // Rollback snapshot + log baris ini supaya tidak ada data ganda di
      // Tempat Sampah saat baris aktifnya masih ada.
      if (trashItemId) {
        await admin.from('trash_items').delete().eq('id', trashItemId);
      }
      await admin
        .from('audit_logs')
        .delete()
        .eq('entity_id', row.id)
        .eq('entity_type', 'ASET')
        .eq('action_type', 'DELETE_TO_TRASH')
        .gte('timestamp', startedAt);

      result.failedAssetRequests.push({
        id: row.id,
        itemName: title,
        error: err?.message || 'Gagal memindahkan baris ke Tempat Sampah.',
      });
    }
  }

  // -------------------------------------------------------------------
  // 2. RESET ITEM PR PADA REQUEST ORDER REGION TERSEBUT
  // -------------------------------------------------------------------
  const orders = await fetchRegionOrders(region);

  for (const order of orders) {
    const previousItems = Array.isArray(order.items) ? order.items : [];
    const { items: nextItems, resetCount } = resetPrFields(previousItems);
    if (resetCount === 0) continue;

    const nextStage =
      order.current_stage === 'KELOLA_PR' ? 'REQUEST_ORDER' : order.current_stage;

    const ok = await updateRequestOrder(order.id, {
      items: nextItems,
      current_stage: nextStage,
    });

    if (!ok) {
      result.errors.push(`Gagal mereset ${resetCount} item PR pada ${order.ro_number}.`);
      continue;
    }

    result.resetRoItems += resetCount;
    result.updatedRequestOrders.push(order.ro_number);

    await recordAuditLog(
      actorName,
      actorRole,
      'STATUS_CHANGE',
      'RO',
      order.ro_number,
      `Reset ${resetCount} item PR pada ${order.ro_number} ke On Proses (region ${region}).`,
      {
        entityId: order.id,
        previousState: { items: previousItems, current_stage: order.current_stage },
        newState: { items: nextItems, current_stage: nextStage },
      }
    );
  }

  invalidateAssetRequestsCache();
  invalidateRoCache();

  // -------------------------------------------------------------------
  // 3. RINGKASAN AUDIT LOG
  // -------------------------------------------------------------------
  const summaryParts = [
    `${result.deletedAssetRequests} baris asset_requests region ${region} dipindahkan ke Tempat Sampah`,
    `${result.resetRoItems} item PR pada ${result.updatedRequestOrders.length} RO direset ke On Proses`,
  ];
  if (result.failedAssetRequests.length > 0) {
    summaryParts.push(`${result.failedAssetRequests.length} baris gagal diproses`);
  }
  if (result.errors.length > 0) {
    summaryParts.push(`${result.errors.length} RO gagal direset`);
  }

  await recordAuditLog(
    actorName,
    actorRole,
    'DELETE_TO_TRASH',
    'SYSTEM',
    `Reset Data PR ${region}`,
    summaryParts.join('; ') + '.',
    {}
  );

  result.success = result.failedAssetRequests.length === 0 && result.errors.length === 0;
  return result;
}
