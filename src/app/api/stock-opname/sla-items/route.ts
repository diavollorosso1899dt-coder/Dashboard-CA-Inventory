import { NextRequest, NextResponse } from 'next/server';
import { getRequestOrders, getAssetTransfers } from '@/lib/supabase/server';
import { AssetTransfer, TransferItem } from '@/lib/supabase/types';
import { normalizeSoRegion } from '@/lib/so-harian/region';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'received'; // 'received' | 'fulfilled' | 'all'
    const region = normalizeSoRegion(searchParams.get('region'));
    const rawSince = searchParams.get('sinceDate');
    const sinceDate =
      rawSince && /^\d{4}-\d{2}-\d{2}/.test(rawSince.trim()) ? rawSince.trim().slice(0, 10) : null;

    const [roOrders, transfers] = await Promise.all([
      getRequestOrders(true),
      getAssetTransfers(true),
    ]);

    // Build transfer map mirroring InteractiveSlaDashboard logic
    const transferItemMap = new Map<
      string,
      {
        transfer: AssetTransfer;
        item: TransferItem;
      }
    >();

    (transfers || []).forEach((t) => {
      const dest = (t.to_location || '').toLowerCase().trim();
      (t.items || []).forEach((it) => {
        const itName = (it.item_name || '').toLowerCase().trim();
        const assetId = (it.asset_id || '').toLowerCase().trim();

        if (assetId) {
          transferItemMap.set(assetId, { transfer: t, item: it });
        }
        if (dest && itName) {
          transferItemMap.set(`${dest}:::${itName}`, { transfer: t, item: it });
        }
        if (it.notes) {
          const roMatch = it.notes.match(/RO[:\-\s]*([A-Za-z0-9\-]+)/i);
          if (roMatch && roMatch[1]) {
            transferItemMap.set(`${roMatch[1].toLowerCase().trim()}:::${itName}`, { transfer: t, item: it });
          }
        }
      });
    });

    const items: any[] = [];
    let totalQty = 0;

    (roOrders || []).forEach((ro) => {
      if (region && normalizeSoRegion(ro.region) !== region) return;
      (ro.items || []).forEach((it, idx) => {
        const assetKey = (it.id || '').toLowerCase().trim();
        const branchItemKey = `${(ro.branch_name || '').toLowerCase().trim()}:::${(it.item_name || '').toLowerCase().trim()}`;
        const roItemKey = `${(ro.ro_number || '').toLowerCase().trim()}:::${(it.item_name || '').toLowerCase().trim()}`;

        const matched = transferItemMap.get(assetKey) || transferItemMap.get(roItemKey) || transferItemMap.get(branchItemKey);

        const shippingDate = matched?.transfer.transfer_date || null;
        const receivedDate =
          matched?.transfer.received_date ||
          ro.received_date ||
          ro.arrival_datetime ||
          (it as any).pr_arrival_date ||
          null;
        const sjNumber = matched?.transfer.surat_jalan_number || null;
        const transferStatus = matched?.transfer.status || null;
        const roStage = (ro.current_stage || '').toUpperCase();
        const roStatus = (ro.status || '').toUpperCase();
        const isStageReceived =
          roStage === 'ASET_SAMPAI' ||
          roStage === 'CHECKLIST' ||
          roStage === 'CHECKLIST_DONE' ||
          roStage === 'UPDATE_SLA' ||
          roStage === 'SELESAI' ||
          roStatus === 'COMPLETED' ||
          roStatus === 'CHECKLIST_DONE';
        const isTransferredAndReceived =
          transferStatus === 'RECEIVED' ||
          Boolean(receivedDate) ||
          Number((it as any).received_qty) > 0 ||
          (isStageReceived && Number(it.quantity_fulfilled || 0) > 0);

        // Calculate quantity_fulfilled matching Monitoring SLA
        const quantityOrdered = Number(it.quantity_ordered) || 1;
        const quantityFulfilled = isTransferredAndReceived
          ? Number(
              (matched?.item as any)?.received_quantity ||
                (it as any).received_qty ||
                matched?.item.quantity ||
                it.quantity_fulfilled ||
                quantityOrdered
            )
          : Number(it.quantity_fulfilled || 0);

        const isFulfilled = quantityFulfilled >= quantityOrdered || isTransferredAndReceived;

        // Apply requested filter
        if (filter === 'received' && !isTransferredAndReceived) {
          return;
        }
        if (filter === 'fulfilled' && quantityFulfilled <= 0) {
          return;
        }

        const effectiveDateRaw =
          receivedDate ||
          shippingDate ||
          ((ro as any).updated_at && String((ro as any).updated_at).split('T')[0]) ||
          ro.request_date ||
          new Date().toISOString().split('T')[0];
        const effectiveDate = String(effectiveDateRaw).split('T')[0];

        if (sinceDate && effectiveDate <= sinceDate) {
          return;
        }

        const itemName = (it.item_name || '').trim();
        if (!itemName) return;

        // In Monitoring SLA, Jumlah QTY is quantity_fulfilled (e.g. 1/1 Lengkap -> 1, 24/24 Lengkap -> 24)
        // If filter is 'all' and quantityFulfilled is 0, fallback to quantityOrdered
        const qtyKeluar = quantityFulfilled > 0 ? quantityFulfilled : (filter === 'all' ? quantityOrdered : 0);

        if (qtyKeluar <= 0) return;

        totalQty += qtyKeluar;

        items.push({
          id: it.id || `sla-${ro.id}-${idx}`,
          kode_barang: it.sku || itemName,
          nama_barang: itemName,
          qty: qtyKeluar, // Exact Jumlah Qty from Monitoring SLA!
          quantity_ordered: quantityOrdered,
          quantity_fulfilled: quantityFulfilled,
          status_pemenuhan: isFulfilled ? 'Lengkap' : 'Sebagian',
          satuan: 'UNIT',
          no_ro: ro.ro_number || '-',
          cabang_tujuan: ro.branch_name || '-',
          wilayah: ro.region || '-',
          tgl_order: ro.request_date || '-',
          target_permintaan: ro.target_delivery_date || '-',
          tgl_pengiriman: shippingDate,
          tgl_diterima: receivedDate,
          surat_jalan: sjNumber,
          alokasi_stok: it.stock_source || (matched ? 'GUDANG_SCGA' : 'READY_STOCK'),
          tahap_alur: ro.current_stage || ro.status || 'READY_STOCK',
          tanggal: effectiveDate,
          keterangan: `SLA: ${ro.ro_number} (${quantityFulfilled}/${quantityOrdered} QTY) -> ${ro.branch_name}`,
        });
      });
    });

    return NextResponse.json({
      success: true,
      region: region || 'ALL',
      count: items.length,
      totalQty,
      filter,
      data: items,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
