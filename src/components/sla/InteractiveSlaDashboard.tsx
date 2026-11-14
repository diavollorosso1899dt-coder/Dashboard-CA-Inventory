'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Search, 
  Filter, 
  Download, 
  TrendingUp, 
  Package, 
  Calendar, 
  Layers, 
  ChevronRight, 
  X, 
  Building2, 
  Truck,
  Sparkles,
  BarChart3,
  ExternalLink,
  RotateCcw,
  SlidersHorizontal,
  Box,
  FileSpreadsheet,
} from 'lucide-react';
import { RequestOrder, AssetRequest, RegionType, ROItem, BranchOpeningSummary, AssetTransfer, TransferItem } from '@/lib/supabase/types';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import ColumnVisibilityPicker, { ColumnItem } from '@/components/ui/ColumnVisibilityPicker';
import { StandardRegion, matchesRegion, normalizeRegion } from '@/lib/utils/region-helper';
import { formatDateSlash, formatLeadTime } from '@/lib/utils/date-formatter';
import { RoDateField, getRoDateByField, matchesRoDateRange } from '@/lib/distribution/ro-date-filter';
import BranchReadinessCards from '@/components/sla/BranchReadinessCards';
import OutletMultiSelect from '@/components/sla/OutletMultiSelect';
import MultiSelectFilter, { MultiSelectOption } from '@/components/sla/MultiSelectFilter';
import { SortableHeader, useTableSort } from '@/components/ui/SortableHeader';
import { buildDistributionQueueKeys, resolveReceivedQuantity } from '@/lib/distribution/received-qty';

interface InteractiveSlaDashboardProps {
  initialRoOrders: RequestOrder[];
  initialAssetRequests: AssetRequest[];
  initialBranchSummaries?: BranchOpeningSummary[];
  initialTransfers?: AssetTransfer[];
  metrics: {
    avg_lead_time_days: number;
    sla_on_time_count: number;
    sla_delayed_count: number;
  };
  initialRegion?: RegionType;
}

type ViewMode = 'ITEM' | 'RO' | 'BRANCH';
type SlaStatusFilter = 'ALL' | 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED';
type ActiveTab = 'RO_SLA' | 'BRANCH_READINESS' | 'OVERDUE_ACTION' | 'ASSET_SLA';

interface EnrichedRO {
  id: string;
  ro_number: string;
  branch_name: string;
  region: 'JABODETABEK' | 'KALBAR';
  request_date: string;
  target_delivery_date: string | null;
  status: string;
  current_stage: string;
  arrival_datetime?: string | null;
  items: ROItem[];
  totalQtyOrdered: number;
  totalQtyFulfilled: number;
  fulfillmentPct: number;
  slaCategory: 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED';
  diffDays: number; // positive = days overdue, negative = days remaining
  slaLabel: string;
  /** True bila RO sudah selesai tetapi diterima melewati target permintaan. */
  isLateCompletion: boolean;
  /** Selisih hari tanggal diterima vs target (positif = terlambat). */
  completionDiffDays?: number | null;
}

interface EnrichedSlaItem {
  id: string;
  roId: string;
  ro_number: string;
  branch_name: string;
  region: 'JABODETABEK' | 'KALBAR';
  request_date: string;
  target_delivery_date: string | null;
  status: string;
  current_stage: string;
  item_name: string;
  specification?: string;
  quantity_ordered: number;
  quantity_fulfilled: number;
  received_quantity: number;
  stock_source: 'ON_PROSES' | 'GUDANG_SCGA' | 'PR_VENDOR' | 'CANCELLED';
  pr_vendor_name?: string;
  slaCategory: 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED';
  diffDays: number;
  slaLabel: string;
  /** True bila item sudah diterima tetapi melewati target permintaan. */
  isLateCompletion: boolean;
  isFulfilled: boolean;
  parentRo: EnrichedRO;
  // SLA Distribusi: Tanggal Kirim Surat Jalan vs Tanggal Permintaan
  shipping_date?: string | null;
  received_date?: string | null;
  surat_jalan_number?: string | null;
  transfer_status?: string | null;
  courier?: string | null;
  slaLeadTimeDays?: number | null;
}

/**
 * RO yang sudah dibatalkan/ditolak tidak perlu masuk antrean tindak lanjut.
 */
function isRoClosedForFollowUp(ro: Pick<EnrichedRO, 'status' | 'current_stage'>): boolean {
  return (
    ro.status === 'CANCELLED' ||
    ro.status === 'REJECTED' ||
    ro.current_stage === 'DIBATALKAN'
  );
}

/**
 * Item dari RO yang dibatalkan/ditolak tidak dihitung dalam total maupun KPI.
 */
function isItemCancelled(it: Pick<EnrichedSlaItem, 'stock_source' | 'parentRo'>): boolean {
  return it.stock_source === 'CANCELLED' || isRoClosedForFollowUp(it.parentRo);
}

/**
 * Item dianggap selesai untuk keperluan follow-up bila sudah dibatalkan,
 * sudah diterima seluruhnya di outlet, atau RO-nya sudah dibatalkan.
 * Item yang baru terpenuhi sebagian tetap masuk antrean.
 */
function isItemClosedForFollowUp(it: EnrichedSlaItem): boolean {
  if (isItemCancelled(it)) return true;
  if (it.isFulfilled) return true;
  if (it.received_quantity >= it.quantity_ordered) return true;
  if (it.transfer_status === 'RECEIVED') return true;
  return false;
}

const SLA_RO_COLUMNS: ColumnItem[] = [
  { id: 'ro_number', label: 'No. RO & Wilayah', alwaysVisible: true },
  { id: 'branch_name', label: 'Cabang Outlet' },
  { id: 'request_date', label: 'Tanggal Order' },
  { id: 'target_delivery_date', label: 'Target Permintaan' },
  { id: 'received_date', label: 'Tgl Diterima Outlet' },
  { id: 'sla_status', label: 'Status SLA & Deadline' },
  { id: 'fulfillment', label: 'Pemenuhan Item' },
  { id: 'stage', label: 'Tahap Alur' },
  { id: 'actions', label: 'Aksi / Detail', alwaysVisible: true },
];

const SLA_ITEM_COLUMNS: ColumnItem[] = [
  { id: 'item_name', label: 'Nama Item & Spesifikasi', alwaysVisible: true },
  { id: 'ro_number', label: 'No. RO & Wilayah' },
  { id: 'branch_name', label: 'Cabang Outlet' },
  { id: 'request_date', label: 'Tgl Permintaan (RO)' },
  { id: 'target_delivery_date', label: 'Target Permintaan' },
  { id: 'shipping_date', label: 'Tgl Pengiriman (SJ)' },
  { id: 'received_date', label: 'Tgl Diterima Outlet' },
  { id: 'sla_lead_time', label: 'Durasi SLA Kirim' },
  { id: 'sla_status', label: 'Ketepatan SLA' },
  { id: 'quantity', label: 'Jumlah Permintaan' },
  { id: 'stock_source', label: 'Jumlah yang Diterima' },
  { id: 'stage', label: 'Tahap Alur' },
  { id: 'actions', label: 'Detail RO', alwaysVisible: true },
];

const STOCK_SOURCE_OPTIONS: MultiSelectOption[] = [
  { value: 'GUDANG_SCGA', label: 'Gudang SCGA (Ready Stock)' },
  { value: 'PR_VENDOR', label: 'PR Vendor (Belum Tersedia)' },
  { value: 'ON_PROSES', label: 'On Proses (Default)' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
];

function stockSourceLabel(value: string): string {
  return STOCK_SOURCE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function toSortTime(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function InteractiveSlaDashboard({
  initialRoOrders = [],
  initialAssetRequests = [],
  initialBranchSummaries = [],
  initialTransfers = [],
  metrics,
  initialRegion = 'ALL',
}: InteractiveSlaDashboardProps) {
  const [selectedRegion, setSelectedRegion] = useState<StandardRegion>(normalizeRegion(initialRegion));
  const [activeTab, setActiveTab] = useState<ActiveTab>('RO_SLA');
  
  // View Mode: 'ITEM' (Per Item) or 'RO' (Per Dokumen RO)
  const [viewMode, setViewMode] = useState<ViewMode>('ITEM');

  // Column Level Filters
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedStage, setSelectedStage] = useState<string[]>([]);
  const [dateField, setDateField] = useState<RoDateField>('order_date');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedStockSource, setSelectedStockSource] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<SlaStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  
  // Column Visibility for RO
  const [visibleRoColumns, setVisibleRoColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ca_sla_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      ro_number: true,
      branch_name: true,
      request_date: true,
      target_delivery_date: true,
      received_date: true,
      sla_status: true,
      fulfillment: true,
      stage: true,
      actions: true,
    };
  });

  // Column Visibility for Item
  const [visibleItemColumns, setVisibleItemColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ca_sla_item_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      item_name: true,
      ro_number: true,
      branch_name: true,
      request_date: true,
      target_delivery_date: true,
      shipping_date: true,
      received_date: true,
      sla_lead_time: true,
      sla_status: true,
      quantity: true,
      stock_source: true,
      stage: true,
      actions: true,
    };
  });

  const [selectedRoDetail, setSelectedRoDetail] = useState<EnrichedRO | null>(null);
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});

  // Item yang dibatalkan per item tidak ditampilkan/dihitung di detail RO.
  const selectedRoDetailItems = selectedRoDetail?.items || [];
  const selectedRoDetailActiveItems = selectedRoDetailItems.filter(
    (it) => it.stock_source !== 'CANCELLED'
  );
  const selectedRoDetailCancelledCount =
    selectedRoDetailItems.length - selectedRoDetailActiveItems.length;

  useEffect(() => {
    const syncReceivedQtyMap = () => {
      try {
        const saved = localStorage.getItem('ca_received_qty_map');
        if (saved) {
          setReceivedQtyMap(JSON.parse(saved));
        }
      } catch {}
    };
    syncReceivedQtyMap();
    window.addEventListener('storage', syncReceivedQtyMap);
    window.addEventListener('ca_received_qty_updated', syncReceivedQtyMap);
    return () => {
      window.removeEventListener('storage', syncReceivedQtyMap);
      window.removeEventListener('ca_received_qty_updated', syncReceivedQtyMap);
    };
  }, []);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const today = useMemo(() => new Date(), []);

  const applyDatePreset = (preset: 'today' | '7days' | 'month' | 'clear') => {
    if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
      setCurrentPage(1);
      return;
    }
    const now = new Date();
    const todayStr = toYmd(now);
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const d7 = new Date(now);
      d7.setDate(now.getDate() - 6);
      setStartDate(toYmd(d7));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      setStartDate(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(todayStr);
    }
    setCurrentPage(1);
  };

  // 1. Process & Enrich RO data with SLA and target delivery calculations
  const enrichedOrders: EnrichedRO[] = useMemo(() => {
    return initialRoOrders.map((ro) => {
      const items = ro.items || [];
      // Item yang dibatalkan per item tidak dihitung sebagai item yang diajukan.
      const activeItems = items.filter((it) => it.stock_source !== 'CANCELLED');
      const totalQtyOrdered = activeItems.reduce((sum, it) => sum + (it.quantity_ordered || 0), 0);
      const totalQtyFulfilled = activeItems.reduce((sum, it) => sum + (it.quantity_fulfilled || 0), 0);
      const fulfillmentPct = totalQtyOrdered > 0 ? Math.round((totalQtyFulfilled / totalQtyOrdered) * 100) : 0;

      const isCompleted = ro.status === 'COMPLETED' || ro.current_stage === 'SELESAI';
      const targetStr = ro.target_delivery_date;

      let slaCategory: 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED' = 'ON_TIME';
      let diffDays = 0;
      let slaLabel = 'Sesuai Target';
      let isLateCompletion = false;
      let completionDiffDays: number | null = null;

      if (isCompleted) {
        slaCategory = 'COMPLETED';
        slaLabel = 'Selesai Terpenuhi';
        if (targetStr) {
          const targetDate = new Date(targetStr);
          const doneDate = ro.arrival_datetime ? new Date(ro.arrival_datetime) : targetDate;
          const diff = Math.round((doneDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
          diffDays = diff;
          completionDiffDays = diff;
          if (diff > 0) {
            isLateCompletion = true;
            slaLabel = `Selesai Terlambat (+${diff} hari)`;
          } else {
            slaLabel = 'Selesai Tepat Waktu';
          }
        }
      } else if (targetStr) {
        const targetDate = new Date(targetStr);
        const diffMs = today.getTime() - targetDate.getTime();
        diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
          slaCategory = 'OVERDUE';
          slaLabel = `Terlambat ${diffDays} Hari`;
        } else if (Math.abs(diffDays) <= 3) {
          slaCategory = 'CRITICAL';
          slaLabel = `Kritis (Sisa ${Math.abs(diffDays)} Hari)`;
        } else {
          slaCategory = 'ON_TIME';
          slaLabel = `Aman (Sisa ${Math.abs(diffDays)} Hari)`;
        }
      } else {
        const reqDate = new Date(ro.request_date);
        const daysPassed = Math.round((today.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
        diffDays = daysPassed - 14;
        if (daysPassed > 14) {
          slaCategory = 'OVERDUE';
          slaLabel = `Lewat 14 Hari (+${daysPassed - 14}h)`;
        } else if (daysPassed >= 11) {
          slaCategory = 'CRITICAL';
          slaLabel = `Mendekati 14 Hari`;
        } else {
          slaCategory = 'ON_TIME';
          slaLabel = `Berjalan (${daysPassed}/14 Hari)`;
        }
      }

      return {
        id: ro.id,
        ro_number: ro.ro_number,
        branch_name: ro.branch_name,
        region: ro.region,
        request_date: ro.request_date,
        target_delivery_date: ro.target_delivery_date || null,
        status: ro.status,
        current_stage: ro.current_stage || ro.status,
        arrival_datetime: ro.arrival_datetime || null,
        items,
        totalQtyOrdered,
        totalQtyFulfilled,
        fulfillmentPct,
        slaCategory,
        diffDays,
        slaLabel,
        isLateCompletion,
        completionDiffDays,
      };
    });
  }, [initialRoOrders, today]);

  // Map transfers by RO Number, Asset ID, and Branch + Item Name for distribution SLA tracking
  const transferItemMap = useMemo(() => {
    const map = new Map<string, {
      transfer: AssetTransfer;
      item: TransferItem;
    }>();

    (initialTransfers || []).forEach((t) => {
      const dest = (t.to_location || '').toLowerCase().trim();
      (t.items || []).forEach((it) => {
        const itName = (it.item_name || '').toLowerCase().trim();
        const assetId = (it.asset_id || '').toLowerCase().trim();
        
        if (assetId) {
          map.set(assetId, { transfer: t, item: it });
        }
        if (dest && itName) {
          map.set(`${dest}:::${itName}`, { transfer: t, item: it });
        }
        if (it.notes) {
          const roMatch = it.notes.match(/RO[:\-\s]*([A-Za-z0-9\-]+)/i);
          if (roMatch && roMatch[1]) {
            map.set(`${roMatch[1].toLowerCase().trim()}:::${itName}`, { transfer: t, item: it });
          }
        }
      });
    });

    return map;
  }, [initialTransfers]);

  // 2. Flatten all RO items to enriched items list with Distribution SLA metrics
  const enrichedItems: EnrichedSlaItem[] = useMemo(() => {
    const list: EnrichedSlaItem[] = [];
    enrichedOrders.forEach((ro) => {
      (ro.items || []).forEach((it, idx) => {
        const assetKey = (it.id || '').toLowerCase().trim();
        const branchItemKey = `${ro.branch_name.toLowerCase().trim()}:::${(it.item_name || '').toLowerCase().trim()}`;
        const roItemKey = `${ro.ro_number.toLowerCase().trim()}:::${(it.item_name || '').toLowerCase().trim()}`;
        
        const matched = transferItemMap.get(assetKey) || transferItemMap.get(roItemKey) || transferItemMap.get(branchItemKey);

        const shippingDate = matched?.transfer.transfer_date || null;
        const receivedDate = matched?.transfer.received_date || ro.arrival_datetime || null;
        const sjNumber = matched?.transfer.surat_jalan_number || null;
        const transferStatus = matched?.transfer.status || null;
        const courier = matched?.transfer.expedition_courier || null;

        // Hitung selisih SLA: Tanggal Pengiriman vs Tanggal Permintaan di Kelola RO
        let slaLeadTimeDays: number | null = null;
        if (shippingDate && ro.request_date) {
          const reqTime = new Date(ro.request_date).getTime();
          const shipTime = new Date(shippingDate).getTime();
          slaLeadTimeDays = Math.max(0, Math.round((shipTime - reqTime) / (1000 * 60 * 60 * 24)));
        }

        const isTransferredAndReceived = transferStatus === 'RECEIVED' || Boolean(receivedDate);
        const isFulfilled = (it.quantity_fulfilled || 0) >= (it.quantity_ordered || 1) || isTransferredAndReceived;
        
        let itemSlaCategory = ro.slaCategory;
        let itemSlaLabel = ro.slaLabel;
        let itemDiffDays = ro.diffDays;
        let isLateCompletion = false;

        if (isTransferredAndReceived || isFulfilled) {
          // Acuan SLA = target permintaan. Item baru dihitung terlambat bila
          // tanggal diterima di outlet melewati target, bukan tanggal kirim SJ.
          const targetTime = toSortTime(ro.target_delivery_date);
          const receivedTime = toSortTime(receivedDate || shippingDate);

          if (targetTime !== null && receivedTime !== null) {
            const diffTarget = Math.round((receivedTime - targetTime) / (1000 * 60 * 60 * 24));
            itemDiffDays = diffTarget;
            itemSlaCategory = 'COMPLETED';
            isLateCompletion = diffTarget > 0;
            itemSlaLabel = isLateCompletion
              ? `Diterima Terlambat (+${diffTarget} Hari)`
              : `Tepat Target (${slaLeadTimeDays !== null ? slaLeadTimeDays + 'h Kirim' : 'Sesuai Target'})`;
          } else {
            // Tanpa target: pakai SLA standar 14 hari dari tanggal order.
            const requestTime = toSortTime(ro.request_date);
            if (requestTime !== null && receivedTime !== null) {
              const diffStandard = Math.round(
                (receivedTime - (requestTime + 14 * 24 * 60 * 60 * 1000)) / (1000 * 60 * 60 * 24)
              );
              itemDiffDays = diffStandard;
              itemSlaCategory = 'COMPLETED';
              isLateCompletion = diffStandard > 0;
              itemSlaLabel = isLateCompletion
                ? `Diterima Lewat SLA 14 Hari (+${diffStandard} Hari)`
                : 'Tepat SLA Standar 14 Hari';
            } else {
              itemSlaCategory = 'COMPLETED';
              itemSlaLabel = 'Diterima di Outlet';
            }
          }
        } else if (ro.slaCategory === 'COMPLETED' && !isFulfilled) {
          itemSlaCategory = 'CRITICAL';
          itemSlaLabel = 'Belum Lengkap';
        }

        const orderedQty = it.quantity_ordered || 1;
        const resolvedStockSource = it.stock_source || (matched ? 'GUDANG_SCGA' : 'ON_PROSES');
        const candidateKeys = buildDistributionQueueKeys({
          roId: ro.id,
          roNumber: ro.ro_number,
          branchName: ro.branch_name,
          itemId: it.id,
          itemName: it.item_name,
        });
        const receivedQuantity = resolveReceivedQuantity({
          orderedQty,
          itemReceivedQty: (it as any).received_qty,
          itemFulfilledQty: it.quantity_fulfilled,
          stockSource: resolvedStockSource,
          transferReceivedQty: matched?.item.received_quantity,
          transferQty: matched?.item.quantity,
          isTransferredAndReceived,
          receivedQtyMap,
          candidateKeys,
        });

        list.push({
          id: it.id || `item-${ro.id}-${idx}`,
          roId: ro.id,
          ro_number: ro.ro_number,
          branch_name: ro.branch_name,
          region: ro.region,
          request_date: ro.request_date,
          target_delivery_date: ro.target_delivery_date,
          status: ro.status,
          current_stage: ro.current_stage,
          item_name: it.item_name,
          specification: it.specification,
          quantity_ordered: orderedQty,
          quantity_fulfilled: isTransferredAndReceived ? (matched?.item.quantity || orderedQty) : (it.quantity_fulfilled || 0),
          received_quantity: receivedQuantity,
          stock_source: resolvedStockSource,
          pr_vendor_name: it.pr_vendor_name,
          slaCategory: itemSlaCategory,
          diffDays: itemDiffDays,
          slaLabel: itemSlaLabel,
          isLateCompletion,
          isFulfilled,
          parentRo: ro,
          shipping_date: shippingDate,
          received_date: receivedDate,
          surat_jalan_number: sjNumber,
          transfer_status: transferStatus,
          courier,
          slaLeadTimeDays,
        });
      });
    });
    return list;
  }, [enrichedOrders, transferItemMap, receivedQtyMap]);

  // 3. Filter by Region first (Scope for dropdown options)
  const regionOrders = useMemo(() => {
    return enrichedOrders.filter((o) => matchesRegion(o.region, selectedRegion));
  }, [enrichedOrders, selectedRegion]);

  const regionItems = useMemo(() => {
    return enrichedItems.filter((it) => matchesRegion(it.region, selectedRegion));
  }, [enrichedItems, selectedRegion]);

  // Dropdown options
  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    regionOrders.forEach((o) => {
      if (o.branch_name) set.add(o.branch_name.trim());
    });
    return Array.from(set).sort();
  }, [regionOrders]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    regionOrders.forEach((o) => {
      const st = o.current_stage || o.status;
      if (st) set.add(st);
    });
    return Array.from(set).sort();
  }, [regionOrders]);

  // 4. Base Filtered Orders & Items
  const baseFilteredOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enrichedOrders.filter((o) => {
      if (!matchesRegion(o.region, selectedRegion)) return false;
      if (selectedBranches.length > 0 && !selectedBranches.includes((o.branch_name || '').trim())) return false;
      if (selectedStage.length > 0) {
        const st = o.current_stage || o.status;
        if (!selectedStage.includes(st)) return false;
      }
      if (!matchesRoDateRange(getRoDateByField(o, dateField), startDate, endDate)) return false;
      if (selectedStockSource.length > 0) {
        const hasMatchingStock = o.items.some((it) =>
          selectedStockSource.includes(it.stock_source || 'ON_PROSES')
        );
        if (!hasMatchingStock) return false;
      }
      if (q) {
        const matchRo = o.ro_number.toLowerCase().includes(q);
        const matchBranch = o.branch_name.toLowerCase().includes(q);
        const matchItem = o.items.some((it) => it.item_name.toLowerCase().includes(q));
        if (!matchRo && !matchBranch && !matchItem) return false;
      }
      return true;
    });
  }, [enrichedOrders, selectedRegion, selectedBranches, selectedStage, dateField, startDate, endDate, selectedStockSource, search]);

  const baseFilteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enrichedItems.filter((it) => {
      if (!matchesRegion(it.region, selectedRegion)) return false;
      if (selectedBranches.length > 0 && !selectedBranches.includes((it.branch_name || '').trim())) return false;
      if (selectedStage.length > 0) {
        const st = it.current_stage || it.status;
        if (!selectedStage.includes(st)) return false;
      }
      if (!matchesRoDateRange(getRoDateByField(it, dateField), startDate, endDate)) return false;
      if (selectedStockSource.length > 0) {
        if (!selectedStockSource.includes(it.stock_source || 'ON_PROSES')) return false;
      }
      if (q) {
        const matchItem = it.item_name.toLowerCase().includes(q);
        const matchRo = it.ro_number.toLowerCase().includes(q);
        const matchBranch = it.branch_name.toLowerCase().includes(q);
        const matchVendor = it.pr_vendor_name ? it.pr_vendor_name.toLowerCase().includes(q) : false;
        if (!matchItem && !matchRo && !matchBranch && !matchVendor) return false;
      }
      return true;
    });
  }, [enrichedItems, selectedRegion, selectedBranches, selectedStage, dateField, startDate, endDate, selectedStockSource, search]);

  // 5. Final Displayed Lists (applying Status Filter)
  const finalFilteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return baseFilteredOrders;
    if (statusFilter === 'OVERDUE' || statusFilter === 'CRITICAL') {
      return baseFilteredOrders.filter(
        (o) => o.slaCategory === statusFilter && !isRoClosedForFollowUp(o)
      );
    }
    return baseFilteredOrders.filter((o) => o.slaCategory === statusFilter);
  }, [baseFilteredOrders, statusFilter]);

  const finalFilteredItems = useMemo(() => {
    if (statusFilter === 'ALL') return baseFilteredItems;
    if (statusFilter === 'OVERDUE' || statusFilter === 'CRITICAL') {
      return baseFilteredItems.filter(
        (it) => it.slaCategory === statusFilter && !isItemClosedForFollowUp(it)
      );
    }
    return baseFilteredItems.filter((it) => it.slaCategory === statusFilter);
  }, [baseFilteredItems, statusFilter]);

  // 6. DYNAMIC KPI STATS: mengikuti filter wilayah/outlet/tanggal/stok/pencarian.
  // Pill status hanya memfilter tabel, tidak mengubah angka KPI.
  // RO yang dibatalkan/ditolak tidak dihitung sebagai total RO.
  const kpiStats = useMemo(() => {
    const processedOrders = baseFilteredOrders.filter((o) => !isRoClosedForFollowUp(o));
    const processedItems = baseFilteredItems.filter((it) => !isItemCancelled(it));

    // Context counts (hanya RO/item yang masih diproses, tanpa yang batal)
    const contextTotalRO = processedOrders.length;
    let completedRoCount = 0;
    let completedRoOnTimeCount = 0;
    let overdueRoCount = 0;
    let criticalRoCount = 0;
    let onTimeRoCount = 0;
    let totalItemsOrdered = 0;
    let totalItemsFulfilled = 0;
    let leadTimeDaysSum = 0;
    let leadTimeCount = 0;

    processedOrders.forEach((o) => {
      totalItemsOrdered += o.totalQtyOrdered;
      totalItemsFulfilled += o.totalQtyFulfilled;

      if (o.slaCategory === 'COMPLETED') {
        completedRoCount++;
        if (!o.isLateCompletion) completedRoOnTimeCount++;
      } else if (o.slaCategory === 'OVERDUE') {
        overdueRoCount++;
      } else if (o.slaCategory === 'CRITICAL') {
        criticalRoCount++;
      } else onTimeRoCount++;

      if (o.request_date && (o.target_delivery_date || o.arrival_datetime)) {
        const start = new Date(o.request_date).getTime();
        const end = new Date(o.arrival_datetime || o.target_delivery_date!).getTime();
        const diff = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
        if (!isNaN(diff) && diff < 365) {
          leadTimeDaysSum += diff;
          leadTimeCount++;
        }
      }
    });

    // Item-level counts in scoped list
    const contextTotalItems = processedItems.length;
    let completedItemCount = 0;
    let completedItemOnTimeCount = 0;
    let overdueItemCount = 0;
    let criticalItemCount = 0;
    let onTimeItemCount = 0;

    processedItems.forEach((it) => {
      if (it.slaCategory === 'COMPLETED') {
        completedItemCount++;
        if (!it.isLateCompletion) completedItemOnTimeCount++;
      } else if (it.slaCategory === 'OVERDUE') {
        overdueItemCount++;
      } else if (it.slaCategory === 'CRITICAL') {
        criticalItemCount++;
      } else onTimeItemCount++;
    });

    // KPI ketepatan waktu hanya menghitung yang sudah diterima outlet.
    // Item/RO yang masih berjalan tidak masuk numerator maupun denominator.
    const onTimeRoTotal = completedRoOnTimeCount;
    const roFulfillmentRatePct = completedRoCount > 0 ? Math.round((completedRoOnTimeCount / completedRoCount) * 1000) / 10 : 0;

    const onTimeItemTotal = completedItemOnTimeCount;
    const itemFulfillmentRatePct = totalItemsOrdered > 0 ? Math.round((totalItemsFulfilled / totalItemsOrdered) * 1000) / 10 : 0;
    const itemOnTimeRatePct = completedItemCount > 0 ? Math.round((completedItemOnTimeCount / completedItemCount) * 1000) / 10 : 0;

    const avgLeadTimeDays = leadTimeCount > 0 ? Math.round((leadTimeDaysSum / leadTimeCount) * 10) / 10 : metrics.avg_lead_time_days;

    return {
      // RO metrics
      totalRO: processedOrders.length,
      contextTotalRO,
      completedRoCount,
      completedRoOnTimeCount,
      overdueRoCount,
      criticalRoCount,
      onTimeRoCount,
      onTimeRoTotal,
      roFulfillmentRatePct,

      // Item metrics
      totalItems: processedItems.length,
      contextTotalItems,
      totalItemsOrdered,
      totalItemsFulfilled,
      completedItemCount,
      completedItemOnTimeCount,
      overdueItemCount,
      criticalItemCount,
      onTimeItemCount,
      onTimeItemTotal,
      itemFulfillmentRatePct,
      itemOnTimeRatePct,

      avgLeadTimeDays,
    };
  }, [baseFilteredOrders, baseFilteredItems, metrics.avg_lead_time_days]);

  // Overdue Items from Asset Requests (> 14 days and still not completed)
  const overdueAssetItems = useMemo(() => {
    return initialAssetRequests.filter((it) => {
      if (!matchesRegion(it.region, selectedRegion)) return false;
      if (selectedBranches.length > 0 && !selectedBranches.includes((it.branch_name || '').trim())) return false;
      const status = (it.item_delivery_status || '').toLowerCase();
      const isDone =
        status.includes('terima outlet') ||
        status.includes('lengkap') ||
        status.includes('selesai');
      const isCancelled = status.includes('batal') || status.includes('cancel');
      return !isDone && !isCancelled && it.lead_time_days > 14;
    });
  }, [initialAssetRequests, selectedRegion, selectedBranches]);

  // Pagination
  const activeListLength = viewMode === 'ITEM' ? finalFilteredItems.length : finalFilteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / pageSize));
  
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return finalFilteredOrders.slice(start, start + pageSize);
  }, [finalFilteredOrders, currentPage, pageSize]);

  const customSlaItemSortFns = useMemo(
    () => ({
      item_name: (a: any, b: any) =>
        (a.item_name || '').localeCompare(b.item_name || '', 'id', { sensitivity: 'base' }),
      ro_number: (a: any, b: any) =>
        (a.parentRo?.ro_number || '').localeCompare(b.parentRo?.ro_number || '', 'id', { numeric: true }),
      branch_name: (a: any, b: any) =>
        (a.parentRo?.branch_name || '').localeCompare(b.parentRo?.branch_name || '', 'id', { sensitivity: 'base' }),
      request_date: (a: any, b: any) => {
        const da = toSortTime(a.request_date);
        const db = toSortTime(b.request_date);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      },
      target_delivery_date: (a: any, b: any) => {
        // Baris tanpa target memakai SLA standar 14 hari dari tanggal order,
        // sama seperti yang ditampilkan di kolom ("SLA Standar 14h").
        const effectiveTarget = (row: any) => {
          const target = toSortTime(row.target_delivery_date);
          if (target !== null) return target;
          const request = toSortTime(row.request_date);
          return request === null ? Number.POSITIVE_INFINITY : request + 14 * 24 * 60 * 60 * 1000;
        };
        return effectiveTarget(a) - effectiveTarget(b);
      },
      sla_lead_time: (a: any, b: any) => {
        const da = a.slaLeadTimeDays;
        const db = b.slaLeadTimeDays;
        if (da === null || da === undefined) return db === null || db === undefined ? 0 : 1;
        if (db === null || db === undefined) return -1;
        return da - db;
      },
      sla_status: (a: any, b: any) => {
        // Urutkan dari yang paling kritis: Terlambat → Kritis → Selesai terlambat → Tepat → Selesai.
        const rank = (row: any) => {
          if (row.slaCategory === 'OVERDUE') return 0;
          if (row.slaCategory === 'CRITICAL') return 1;
          if (row.slaCategory === 'COMPLETED' && row.isLateCompletion) return 2;
          if (row.slaCategory === 'ON_TIME') return 3;
          if (row.slaCategory === 'COMPLETED') return 4;
          return 5;
        };
        return rank(a) - rank(b);
      },
      quantity: (a: any, b: any) => (Number(a.quantity_ordered) || 0) - (Number(b.quantity_ordered) || 0),
      stock_source: (a: any, b: any) =>
        (Number(a.received_quantity) || 0) - (Number(b.received_quantity) || 0),
      stage: (a: any, b: any) =>
        (a.current_stage || '').localeCompare(b.current_stage || '', 'id'),
    }),
    []
  );

  const {
    sortField: slaSortField,
    sortDirection: slaSortDirection,
    handleSort: handleSlaSort,
    sortedItems: sortedFinalFilteredItems,
  } = useTableSort<any>(finalFilteredItems, null, 'asc', customSlaItemSortFns);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedFinalFilteredItems.slice(start, start + pageSize);
  }, [sortedFinalFilteredItems, currentPage, pageSize]);

  // Active filter flag
  const isAnyFilterActive = useMemo(() => {
    return (
      selectedRegion !== 'ALL' ||
      selectedBranches.length > 0 ||
      selectedStage.length > 0 ||
      startDate !== '' ||
      endDate !== '' ||
      selectedStockSource.length > 0 ||
      statusFilter !== 'ALL' ||
      search.trim() !== ''
    );
  }, [selectedRegion, selectedBranches, selectedStage, startDate, endDate, selectedStockSource, statusFilter, search]);

  const handleResetFilters = () => {
    setSelectedRegion('ALL');
    setSelectedBranches([]);
    setSelectedStage([]);
    setDateField('order_date');
    setStartDate('');
    setEndDate('');
    setSelectedStockSource([]);
    setStatusFilter('ALL');
    setSearch('');
    setCurrentPage(1);
  };

  // Export Overdue Items to CSV for immediate procurement follow-up
  const handleExportOverdue = () => {
    if (viewMode === 'ITEM') {
      const overdueList = baseFilteredItems.filter(
        (it) =>
          (it.slaCategory === 'OVERDUE' || it.slaCategory === 'CRITICAL') &&
          !isItemClosedForFollowUp(it)
      );
      if (overdueList.length === 0) {
        alert('Tidak ada data item RO yang terlambat/kritis untuk diekspor pada filter aktif saat ini.');
        return;
      }

      const headers = ['Nama Item', 'No RO', 'Cabang Outlet', 'Wilayah', 'Tanggal Order', 'Target Permintaan', 'Alokasi Stok', 'Status SLA', 'Hari Keterlambatan', 'Qty Order', 'Qty Terpenuhi', 'Vendor'];
      const rows = overdueList.map((it) => [
        `"${it.item_name}"`,
        `"${it.ro_number}"`,
        `"${it.branch_name}"`,
        `"${it.region}"`,
        `"${formatDateSlash(it.request_date)}"`,
        `"${formatDateSlash(it.target_delivery_date)}"`,
        `"${it.stock_source}"`,
        `"${it.slaLabel}"`,
        `"${it.diffDays > 0 ? `+${it.diffDays} hari` : `${it.diffDays} hari`}"`,
        it.quantity_ordered,
        it.quantity_fulfilled,
        `"${it.pr_vendor_name || '-'}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `SLA_Overdue_Items_Report_${selectedRegion}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const overdueList = baseFilteredOrders.filter(
        (o) =>
          (o.slaCategory === 'OVERDUE' || o.slaCategory === 'CRITICAL') &&
          !isRoClosedForFollowUp(o)
      );
      if (overdueList.length === 0) {
        alert('Tidak ada data dokumen RO yang terlambat/kritis untuk diekspor pada filter aktif saat ini.');
        return;
      }

      const headers = ['No RO', 'Cabang', 'Wilayah', 'Tanggal Input', 'Tanggal Permintaan Target', 'Status SLA', 'Hari Keterlambatan', 'Total Qty Permintaan', 'Total Qty Terpenuhi', 'Daftar Item'];
      const rows = overdueList.map((o) => [
        `"${o.ro_number}"`,
        `"${o.branch_name}"`,
        `"${o.region}"`,
        `"${formatDateSlash(o.request_date)}"`,
        `"${formatDateSlash(o.target_delivery_date)}"`,
        `"${o.slaLabel}"`,
        `"${o.diffDays > 0 ? `+${o.diffDays} hari` : `${o.diffDays} hari`}"`,
        o.totalQtyOrdered,
        o.totalQtyFulfilled,
        `"${o.items.map((it) => `${it.item_name} (${it.quantity_ordered})`).join('; ')}"`,
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `RO_SLA_Overdue_Report_${selectedRegion}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                Monitoring SLA & Ketepatan Pemenuhan
              </h1>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-0.5">
                Kalkulasi KPI interaktif real-time sesuai filter kolom cabang, periode, tahap alur, & status SLA
              </p>
            </div>
          </div>
        </div>

        {/* Area Filter Pills & Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          <AreaFilterPills
            value={selectedRegion}
            onChange={(r) => {
              setSelectedRegion(r);
              setSelectedBranches([]);
              setCurrentPage(1);
            }}
            syncUrl={true}
          />

          {/* Filter Outlet Global (multi-pilih): tampil di semua tab; di tab RO ada di panel filter */}
          {activeTab !== 'RO_SLA' && (
            <OutletMultiSelect
              options={branchOptions}
              selected={selectedBranches}
              onChange={(next) => {
                setSelectedBranches(next);
                setCurrentPage(1);
              }}
            />
          )}

          <button
            onClick={handleExportOverdue}
            className="interactive-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 transition-colors shadow-2xs"
            title="Download CSV daftar terlambat & kritis untuk koordinasi tim logistik/vendor"
          >
            <Download className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span>Ekspor Data Overdue</span>
          </button>
        </div>
      </div>

      {/* 2. DYNAMIC KPI CARDS (Recalculates based on viewMode and active filters) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] uppercase tracking-wider">
              Ringkasan KPI SLA {viewMode === 'ITEM' ? '(Metrik Per Item)' : '(Metrik Per Dokumen RO)'} {isAnyFilterActive ? '• Filter Aktif' : '• Semua Data'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle Pill */}
            <div className="inline-flex items-center rounded-xl bg-[#e9eef6] dark:bg-[#282a2c] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setViewMode('ITEM'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'ITEM' && activeTab === 'RO_SLA'
                    ? 'bg-white dark:bg-[#1a1c1e] text-[#0b57d0] dark:text-[#a8c7fa] shadow-2xs font-bold'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                <span>Tampilan Per Item</span>
              </button>
              <button
                type="button"
                onClick={() => { setViewMode('RO'); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'RO' && activeTab === 'RO_SLA'
                    ? 'bg-white dark:bg-[#1a1c1e] text-[#0b57d0] dark:text-[#a8c7fa] shadow-2xs font-bold'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Tampilan Dokumen RO</span>
              </button>
            </div>

            {isAnyFilterActive && (
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Ketepatan Pemenuhan (Target Permintaan) */}
          <div className="panel-card p-4 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] rounded-2xl relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
                {viewMode === 'ITEM' ? 'Ketepatan Waktu Item' : 'Ketepatan Waktu RO'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                (viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct) >= 80 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' 
                  : (viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct) >= 50
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
              }`}>
                {(viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct) >= 80 ? 'Optimal' : 'Perlu Atensi'}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                {viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct}%
              </span>
              <span className="text-xs text-[#747775] dark:text-[#8e918f]">
                tepat target
              </span>
            </div>

            {/* Progress bar visual */}
            <div className="w-full bg-[#f0f4f9] dark:bg-[#282a2c] h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct) >= 80 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : (viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct) >= 50
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-rose-500 to-orange-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, (viewMode === 'ITEM' ? kpiStats.itemOnTimeRatePct : kpiStats.roFulfillmentRatePct)))}%` }}
              />
            </div>

            <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-2">
              {viewMode === 'ITEM' 
                ? `${kpiStats.onTimeItemTotal} dari ${kpiStats.completedItemCount} baris item sudah diterima tepat target`
                : `${kpiStats.onTimeRoTotal} dari ${kpiStats.completedRoCount} dokumen RO sudah diterima tepat waktu`
              }
            </p>
          </div>

          {/* Card 2: Melewati Target Tanggal Permintaan (Overdue) */}
          <div className={`panel-card p-4 border rounded-2xl shadow-xs transition-all ${
            statusFilter === 'OVERDUE'
              ? 'ring-2 ring-rose-500 border-rose-400 bg-rose-100/60 dark:bg-rose-950/50'
              : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-[#1a1c1e]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider">
                Melewati Deadline
              </span>
              <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
                {viewMode === 'ITEM' ? kpiStats.overdueItemCount : kpiStats.overdueRoCount}
              </span>
              <span className="text-xs text-rose-800/80 dark:text-rose-300/80 font-medium">
                {viewMode === 'ITEM' ? 'baris item' : 'dokumen RO'}
              </span>
            </div>

            <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-3 font-medium">
              Memerlukan tindak lanjut vendor/logistik
            </p>
          </div>

          {/* Card 3: Mendekati Deadline (Kritis H-3) */}
          <div className={`panel-card p-4 border rounded-2xl shadow-xs transition-all ${
            statusFilter === 'CRITICAL'
              ? 'ring-2 ring-amber-500 border-amber-400 bg-amber-100/60 dark:bg-amber-950/50'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-[#1a1c1e]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                Mendekati Deadline (&le; 3 Hari)
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-amber-700 dark:text-amber-400 tracking-tight">
                {viewMode === 'ITEM' ? kpiStats.criticalItemCount : kpiStats.criticalRoCount}
              </span>
              <span className="text-xs text-amber-800/80 dark:text-amber-300/80 font-medium">
                {viewMode === 'ITEM' ? 'baris item' : 'dokumen RO'}
              </span>
            </div>

            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-3 font-medium">
              Segera kirim via surat jalan / pengadaan
            </p>
          </div>

          {/* Card 4: Total Diproses & Rata-rata Lead Time */}
          <div
            className="panel-card p-4 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] rounded-2xl shadow-xs"
            title="Tidak termasuk RO yang dibatalkan/ditolak"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
                {viewMode === 'ITEM' ? 'Total Item Diproses' : 'Total RO Diproses'}
              </span>
              <Package className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#0b57d0] dark:text-[#a8c7fa] tracking-tight">
                {viewMode === 'ITEM' ? kpiStats.totalItems : kpiStats.totalRO}
              </span>
              <span className="text-xs text-[#747775] dark:text-[#8e918f]">
                {viewMode === 'ITEM' ? 'item diproses' : 'RO diproses'}
              </span>
            </div>

            <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-3">
              Fulfillment fisik: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{kpiStats.totalItemsFulfilled}/{kpiStats.totalItemsOrdered} item ({kpiStats.itemFulfillmentRatePct}%)</strong>
            </p>
          </div>
        </div>
      </div>

      {/* 3. TABS NAVIGASI UTAMA */}
      <div className="flex items-center gap-2 border-b border-[#e0e2ec] dark:border-[#444746] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setActiveTab('RO_SLA');
            if (viewMode === 'BRANCH') setViewMode('ITEM');
          }}
          className={`interactive-tap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'RO_SLA'
              ? 'bg-[#0b57d0] text-white shadow-sm'
              : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec]'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Pemantauan SLA RO {viewMode === 'ITEM' ? `Per Item (${finalFilteredItems.length})` : `Per Dokumen (${finalFilteredOrders.length})`}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('OVERDUE_ACTION')}
          className={`interactive-tap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'OVERDUE_ACTION'
              ? 'bg-rose-700 text-white shadow-sm'
              : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-rose-800 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Pusat Tindak Lanjut Overdue ({kpiStats.overdueItemCount + overdueAssetItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ASSET_SLA')}
          className={`interactive-tap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'ASSET_SLA'
              ? 'bg-[#0b57d0] text-white shadow-sm'
              : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Lead Time Pengadaan Aset ({initialAssetRequests.length})</span>
        </button>
      </div>

      {/* TAB: KESIAPAN CABANG & ALERT SLA H-3 */}
      {activeTab === 'BRANCH_READINESS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <BranchReadinessCards
            branchSummaries={initialBranchSummaries.filter(
              (b) =>
                selectedBranches.length === 0 ||
                selectedBranches.includes((b.branch_name || '').trim())
            )}
            enrichedOrders={enrichedOrders.filter(
              (o) =>
                selectedBranches.length === 0 ||
                selectedBranches.includes((o.branch_name || '').trim())
            )}
            selectedRegion={selectedRegion}
            onSelectBranch={(bName) => {
              setSelectedBranches(bName ? [bName] : []);
              setActiveTab('RO_SLA');
              setViewMode('ITEM');
              setCurrentPage(1);
            }}
            onFilterItemsByBranch={(bName, filter) => {
              setSelectedBranches(bName ? [bName] : []);
              if (filter === 'CRITICAL') {
                setStatusFilter('CRITICAL');
              } else {
                setStatusFilter('ALL');
              }
              setActiveTab('RO_SLA');
              setViewMode('ITEM');
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* TAB 1: PEMANTAUAN SLA REQUEST ORDER (PER ITEM / PER DOKUMEN RO) */}
      {activeTab === 'RO_SLA' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* TOOLBAR FILTER KOLOM LENGKAP */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1c1e] border border-[#e0e2ec] dark:border-[#444746] space-y-3.5 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#747775]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={viewMode === 'ITEM' ? "Cari nama item, nomor RO, atau cabang outlet..." : "Cari nomor RO, cabang outlet, atau item..."}
                  className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] pl-9 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              {/* Action Buttons: Column Visibility & Reset */}
              <div className="flex items-center gap-2 flex-wrap">
                {viewMode === 'ITEM' ? (
                  <ColumnVisibilityPicker
                    columns={SLA_ITEM_COLUMNS}
                    visibleColumns={visibleItemColumns}
                    onChange={setVisibleItemColumns}
                    storageKey="ca_sla_item_columns"
                    buttonLabel="Pilih Kolom Item"
                  />
                ) : (
                  <ColumnVisibilityPicker
                    columns={SLA_RO_COLUMNS}
                    visibleColumns={visibleRoColumns}
                    onChange={setVisibleRoColumns}
                    storageKey="ca_sla_columns"
                    buttonLabel="Pilih Kolom RO"
                  />
                )}

                {isAnyFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="interactive-tap inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#282a2c] text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-[#747775]" />
                    <span>Reset Filter</span>
                  </button>
                )}
              </div>
            </div>

            {/* FILTER RENTANG TANGGAL: TGL ORDER / TARGET PERMINTAAN */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a]">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5]">
                  <Calendar className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                  <span>Filter Rentang Tanggal:</span>
                </div>

                <select
                  value={dateField}
                  onChange={(e) => {
                    setDateField(e.target.value as RoDateField);
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-2.5 py-1.5 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  title="Pilih kolom tanggal yang dijadikan acuan filter"
                >
                  <option value="order_date">Berdasarkan Tgl Order</option>
                  <option value="request_date">Berdasarkan Target Permintaan</option>
                </select>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1 text-xs">
                  <span className="text-[11px] font-medium text-[#747775] dark:text-[#8e918f]">Dari:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
                  />
                </div>

                <span className="text-xs text-[#747775] dark:text-[#8e918f] font-bold">s/d</span>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1 text-xs">
                  <span className="text-[11px] font-medium text-[#747775] dark:text-[#8e918f]">Sampai:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
                  />
                </div>

                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyDatePreset('today')}
                    className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] px-2.5 py-1 text-[11px] font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#35383a] transition-colors"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('7days')}
                    className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] px-2.5 py-1 text-[11px] font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#35383a] transition-colors"
                  >
                    7 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('month')}
                    className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] px-2.5 py-1 text-[11px] font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#35383a] transition-colors"
                  >
                    Bulan Ini
                  </button>
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={() => applyDatePreset('clear')}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition-colors"
                    >
                      <X className="h-3 w-3" />
                      <span>Reset Tanggal</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#747775] dark:text-[#8e918f]">
                {startDate || endDate ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-1 font-semibold text-[#0b57d0] dark:text-[#a8c7fa]">
                    <span>
                      Menampilkan <strong>{viewMode === 'ITEM' ? baseFilteredItems.length : baseFilteredOrders.length}</strong>{' '}
                      {viewMode === 'ITEM' ? 'item' : 'dokumen RO'} ({dateField === 'request_date' ? 'Target Permintaan' : 'Tgl Order'}:{' '}
                      {startDate ? formatDateSlash(startDate) : 'Awal'} – {endDate ? formatDateSlash(endDate) : 'Akhir'})
                    </span>
                  </span>
                ) : (
                  <span>
                    Menampilkan semua tanggal ({viewMode === 'ITEM' ? baseFilteredItems.length : baseFilteredOrders.length}{' '}
                    {viewMode === 'ITEM' ? 'item' : 'dokumen RO'})
                  </span>
                )}
              </div>
            </div>

            {/* BARIS DROPDOWN FILTER KOLOM: CABANG (MULTI), ALOKASI STOK, TAHAP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a]">
              {/* 1. Filter Kolom Cabang Outlet (bisa pilih lebih dari satu) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Cabang Outlet (multi):</span>
                </label>
                <OutletMultiSelect
                  options={branchOptions}
                  selected={selectedBranches}
                  onChange={(next) => {
                    setSelectedBranches(next);
                    setCurrentPage(1);
                  }}
                  label="Filter cabang outlet (bisa lebih dari satu)"
                  fullWidth
                />
              </div>

              {/* 2. Filter Kolom Alokasi Stok Item */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Box className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Alokasi Stok:</span>
                </label>
                <MultiSelectFilter
                  options={STOCK_SOURCE_OPTIONS}
                  selected={selectedStockSource}
                  onChange={(next) => {
                    setSelectedStockSource(next);
                    setCurrentPage(1);
                  }}
                  allLabel="Semua Alokasi Stok"
                  noun="Alokasi"
                  searchPlaceholder="Cari alokasi..."
                  icon={Box}
                  ariaLabel="Filter alokasi stok (bisa lebih dari satu)"
                />
              </div>

              {/* 3. Filter Kolom Tahap Alur Kerja */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Truck className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Tahap Alur:</span>
                </label>
                <MultiSelectFilter
                  options={stageOptions.map((st) => ({ value: st, label: st }))}
                  selected={selectedStage}
                  onChange={(next) => {
                    setSelectedStage(next);
                    setCurrentPage(1);
                  }}
                  allLabel="Semua Tahap Alur"
                  noun="Tahap"
                  searchPlaceholder="Cari tahap..."
                  icon={Truck}
                  ariaLabel="Filter tahap alur (bisa lebih dari satu)"
                />
              </div>
            </div>

            {/* QUICK STATUS FILTER PILLS */}
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#e0e2ec] dark:border-[#35383a]">
              <span className="text-[11px] font-bold text-[#747775] mr-1 hidden sm:inline">Status SLA:</span>
              <button
                type="button"
                onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-[#1f1f1f] text-white dark:bg-white dark:text-[#1f1f1f]'
                    : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec]'
                }`}
              >
                Semua ({viewMode === 'ITEM' ? baseFilteredItems.length : baseFilteredOrders.length})
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('OVERDUE'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-rose-700 text-white'
                    : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
                }`}
              >
                <span>🔴 Terlambat ({viewMode === 'ITEM' ? kpiStats.overdueItemCount : kpiStats.overdueRoCount})</span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('CRITICAL'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                  statusFilter === 'CRITICAL'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                <span>🟡 Kritis (&le; 3h) ({viewMode === 'ITEM' ? kpiStats.criticalItemCount : kpiStats.criticalRoCount})</span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('ON_TIME'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                  statusFilter === 'ON_TIME'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <span>🟢 Tepat Waktu ({viewMode === 'ITEM' ? kpiStats.onTimeItemCount : kpiStats.onTimeRoCount})</span>
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('COMPLETED'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 hover:bg-blue-100'
                }`}
              >
                <span>🔵 Selesai ({viewMode === 'ITEM' ? kpiStats.completedItemCount : kpiStats.completedRoCount})</span>
              </button>
            </div>

            {/* Active Filter Indicators Bar */}
            {isAnyFilterActive && (
              <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                <span className="font-bold">Filter aktif:</span>
                {selectedRegion !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Wilayah: {selectedRegion}
                  </span>
                )}
                {selectedBranches.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Outlet ({selectedBranches.length}): {selectedBranches.join(', ')}
                  </span>
                )}
                {(startDate || endDate) && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    {dateField === 'request_date' ? 'Target Permintaan' : 'Tgl Order'}: {startDate ? formatDateSlash(startDate) : 'Awal'} – {endDate ? formatDateSlash(endDate) : 'Akhir'}
                  </span>
                )}
                {selectedStockSource.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Stok ({selectedStockSource.length}): {selectedStockSource.map(stockSourceLabel).join(', ')}
                  </span>
                )}
                {selectedStage.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Tahap ({selectedStage.length}): {selectedStage.join(', ')}
                  </span>
                )}
                {statusFilter !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Status: {statusFilter}
                  </span>
                )}
                {search.trim() && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Cari: &ldquo;{search}&rdquo;
                  </span>
                )}
              </div>
            )}
          </div>

          {/* VIEW MODE 1: TABEL TAMPILAN PER ITEM */}
          {viewMode === 'ITEM' && (
            <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
              <div className="p-3.5 border-b border-[#e0e2ec] dark:border-[#444746] font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between bg-[#f8fafd] dark:bg-[#282a2c]">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-[#0b57d0]" />
                  <span>Daftar Pemantauan SLA Per Item ({finalFilteredItems.length} Baris Item)</span>
                </div>
                <span className="text-[11px] text-[#747775]">Klik baris untuk melihat detail dokumen RO</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                  <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                    <tr>
                      {visibleItemColumns.item_name !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Nama Item Aset / Perlengkapan"
                            field="item_name"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.ro_number !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="No. RO & Wilayah"
                            field="ro_number"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.branch_name !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Cabang Outlet"
                            field="branch_name"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.request_date !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Tgl Order (RO)"
                            field="request_date"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.target_delivery_date !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Target Permintaan"
                            field="target_delivery_date"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.shipping_date !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Tgl Pengiriman (SJ)"
                            field="shipping_date"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.received_date !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Tgl Diterima Outlet"
                            field="received_date"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.sla_lead_time !== false && (
                        <th className="py-3 px-3.5 text-center">
                          <SortableHeader
                            label="Durasi SLA Kirim"
                            field="sla_lead_time"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                            align="center"
                          />
                        </th>
                      )}
                      {visibleItemColumns.sla_status !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Ketepatan SLA"
                            field="sla_status"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.quantity !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Jumlah Qty"
                            field="quantity"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.stock_source !== false && (
                        <th className="py-3 px-3.5 text-center">
                          <SortableHeader
                            label="Jumlah yang Diterima"
                            field="stock_source"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                            align="center"
                          />
                        </th>
                      )}
                      {visibleItemColumns.stage !== false && (
                        <th className="py-3 px-3.5">
                          <SortableHeader
                            label="Tahap Alur"
                            field="stage"
                            currentSortField={slaSortField}
                            currentSortDirection={slaSortDirection}
                            onSort={handleSlaSort}
                          />
                        </th>
                      )}
                      {visibleItemColumns.actions !== false && <th className="py-3 px-3.5 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                    {paginatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p className="font-semibold text-sm">Tidak ada baris item yang sesuai kriteria filter aktif</p>
                          <p className="text-xs mt-1">Coba ubah pilihan filter cabang, alokasi stok, atau reset filter</p>
                          {isAnyFilterActive && (
                            <button
                              type="button"
                              onClick={handleResetFilters}
                              className="mt-3 px-3.5 py-1.5 rounded-full bg-[#0b57d0] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                            >
                              Reset Filter Sekarang
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((it) => (
                        <tr 
                          key={`${it.roId}::${it.id}`}
                          className="hover:bg-[#f0f4f9]/80 dark:hover:bg-[#282a2c]/60 transition-colors cursor-pointer"
                          onClick={() => setSelectedRoDetail(it.parentRo)}
                        >
                          {/* Item Name */}
                          {visibleItemColumns.item_name !== false && (
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</div>
                              {it.specification && (
                                <div className="text-[10px] text-[#747775] line-clamp-1">{it.specification}</div>
                              )}
                            </td>
                          )}

                          {/* RO Number & Region */}
                          {visibleItemColumns.ro_number !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <span className="font-bold text-[#0b57d0] dark:text-[#a8c7fa]">{it.ro_number}</span>
                              <div className="text-[10px] text-[#747775] uppercase">{it.region}</div>
                            </td>
                          )}

                          {/* Branch */}
                          {visibleItemColumns.branch_name !== false && (
                            <td className="py-3 px-3.5 font-medium max-w-[180px] truncate" title={it.branch_name}>
                              {it.branch_name}
                            </td>
                          )}

                          {/* Order Date */}
                          {visibleItemColumns.request_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap text-[#444746] dark:text-[#c4c7c5]">
                              {formatDateSlash(it.request_date)}
                            </td>
                          )}

                          {/* Target Delivery Date */}
                          {visibleItemColumns.target_delivery_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {it.target_delivery_date ? (
                                <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                                  {formatDateSlash(it.target_delivery_date)}
                                </span>
                              ) : (
                                <span className="text-[#747775] italic">SLA Standar 14h</span>
                              )}
                            </td>
                          )}

                          {/* Shipping Date */}
                          {visibleItemColumns.shipping_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {it.shipping_date ? (
                                <div>
                                  <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {formatDateSlash(it.shipping_date)}
                                  </div>
                                  {it.surat_jalan_number && (
                                    <div className="text-[10px] text-[#747775] font-mono">
                                      {it.surat_jalan_number}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Belum Kirim</span>
                              )}
                            </td>
                          )}

                          {/* Received Date */}
                          {visibleItemColumns.received_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {it.received_date ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span>{formatDateSlash(it.received_date)}</span>
                                </span>
                              ) : it.shipping_date ? (
                                <span className="inline-flex flex-col" title="Tanggal diterima outlet belum tercatat; KPI memakai tanggal kirim SJ sebagai fallback">
                                  <span className="text-amber-600 dark:text-amber-400 italic font-semibold">Belum tercatat</span>
                                  <span className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                                    Acuan SJ: {formatDateSlash(it.shipping_date)}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Menunggu Tiba</span>
                              )}
                            </td>
                          )}

                          {/* SLA Lead Time */}
                          {visibleItemColumns.sla_lead_time !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap text-center">
                              {it.slaLeadTimeDays !== null && it.slaLeadTimeDays !== undefined ? (
                                <span className="font-bold font-mono text-[#0b57d0] dark:text-[#a8c7fa] bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900">
                                  {it.slaLeadTimeDays} Hari
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          )}

                          {/* SLA Status Badge */}
                          {visibleItemColumns.sla_status !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                it.slaCategory === 'OVERDUE' || (it.slaCategory === 'COMPLETED' && it.isLateCompletion)
                                  ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                                  : it.slaCategory === 'CRITICAL'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                              }`}>
                                {(it.slaCategory === 'OVERDUE' || (it.slaCategory === 'COMPLETED' && it.isLateCompletion)) && <ShieldAlert className="h-3 w-3 shrink-0" />}
                                {it.slaCategory === 'CRITICAL' && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                {it.slaCategory === 'ON_TIME' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                {it.slaCategory === 'COMPLETED' && !it.isLateCompletion && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                <span>{it.slaLabel}</span>
                              </span>
                            </td>
                          )}

                          {/* Quantity */}
                          {visibleItemColumns.quantity !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-bold text-xs">
                                {it.quantity_fulfilled}/{it.quantity_ordered}
                              </div>
                              <span className={`text-[10px] font-semibold ${it.isFulfilled ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {it.isFulfilled ? 'Lengkap' : 'Menunggu'}
                              </span>
                            </td>
                          )}

                          {/* Jumlah yang Diterima (berdasarkan Pemantauan Distribusi) */}
                          {visibleItemColumns.stock_source !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap text-center">
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono border ${
                                  it.received_quantity >= it.quantity_ordered
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                    : it.received_quantity > 0
                                    ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}>
                                  {it.received_quantity} unit
                                </span>
                                <span className={`text-[10px] font-medium ${
                                  it.received_quantity !== it.quantity_ordered && it.received_quantity > 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-[#747775] dark:text-[#8e918f]'
                                }`}>
                                  dari {it.quantity_ordered} unit
                                </span>
                              </div>
                            </td>
                          )}

                          {/* Stage */}
                          {visibleItemColumns.stage !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] border border-[#e0e2ec] dark:border-[#444746]">
                                {it.current_stage || it.status}
                              </span>
                            </td>
                          )}

                          {/* Action Detail */}
                          {visibleItemColumns.actions !== false && (
                            <td className="py-3 px-3.5 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRoDetail(it.parentRo);
                                }}
                                className="p-1 rounded-lg text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-blue-950/50"
                                title="Lihat Dokumen RO Lengkap"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="p-3 border-t border-[#e0e2ec] dark:border-[#444746] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-[#444746] dark:text-[#c4c7c5]">
                <div className="flex items-center gap-2">
                  <span>Menampilkan {paginatedItems.length} dari {finalFilteredItems.length} baris item terfilter</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-2 py-1 text-xs"
                  >
                    <option value={10}>10 per hal</option>
                    <option value={25}>25 per hal</option>
                    <option value={50}>50 per hal</option>
                    <option value={100}>100 per hal</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] disabled:opacity-40 text-xs font-semibold"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-2 font-bold text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] disabled:opacity-40 text-xs font-semibold"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: TABEL TAMPILAN PER DOKUMEN RO */}
          {viewMode === 'RO' && (
            <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
              <div className="p-3.5 border-b border-[#e0e2ec] dark:border-[#444746] font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between bg-[#f8fafd] dark:bg-[#282a2c]">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#0b57d0]" />
                  <span>Daftar Pemantauan SLA Per Dokumen RO ({finalFilteredOrders.length} Dokumen)</span>
                </div>
                <span className="text-[11px] text-[#747775]">Klik baris untuk melihat rincian item di dalam RO</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                  <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                    <tr>
                      {visibleRoColumns.ro_number !== false && <th className="py-3 px-3.5">No. RO & Wilayah</th>}
                      {visibleRoColumns.branch_name !== false && <th className="py-3 px-3.5">Cabang Outlet</th>}
                      {visibleRoColumns.request_date !== false && <th className="py-3 px-3.5">Tgl Order</th>}
                      {visibleRoColumns.target_delivery_date !== false && <th className="py-3 px-3.5">Target Permintaan</th>}
                      {visibleRoColumns.received_date !== false && <th className="py-3 px-3.5">Tgl Diterima Outlet</th>}
                      {visibleRoColumns.sla_status !== false && <th className="py-3 px-3.5">Status SLA & Deadline</th>}
                      {visibleRoColumns.fulfillment !== false && <th className="py-3 px-3.5">Pemenuhan Item</th>}
                      {visibleRoColumns.stage !== false && <th className="py-3 px-3.5">Tahap Alur</th>}
                      {visibleRoColumns.actions !== false && <th className="py-3 px-3.5 text-center">Aksi</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                    {paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
                          <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p className="font-semibold text-sm">Tidak ada dokumen RO yang sesuai kriteria filter aktif</p>
                          <p className="text-xs mt-1">Coba ubah pilihan filter kolom cabang, bulan, atau reset filter</p>
                          {isAnyFilterActive && (
                            <button
                              type="button"
                              onClick={handleResetFilters}
                              className="mt-3 px-3.5 py-1.5 rounded-full bg-[#0b57d0] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                            >
                              Reset Filter Sekarang
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((o) => (
                        <tr 
                          key={o.id}
                          className="hover:bg-[#f0f4f9]/80 dark:hover:bg-[#282a2c]/60 transition-colors cursor-pointer"
                          onClick={() => setSelectedRoDetail(o)}
                        >
                          {/* RO Number & Region */}
                          {visibleRoColumns.ro_number !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-bold text-[#0b57d0] dark:text-[#a8c7fa] flex items-center gap-1.5">
                                <span>{o.ro_number}</span>
                              </div>
                              <span className="text-[10px] text-[#747775] dark:text-[#8e918f] uppercase">
                                {o.region}
                              </span>
                            </td>
                          )}

                          {/* Outlet Branch */}
                          {visibleRoColumns.branch_name !== false && (
                            <td className="py-3 px-3.5 font-medium max-w-[200px] truncate" title={o.branch_name}>
                              {o.branch_name}
                            </td>
                          )}

                          {/* Order Date */}
                          {visibleRoColumns.request_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap text-[#444746] dark:text-[#c4c7c5]">
                              {formatDateSlash(o.request_date)}
                            </td>
                          )}

                          {/* Target Delivery Date */}
                          {visibleRoColumns.target_delivery_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {o.target_delivery_date ? (
                                <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                                  {formatDateSlash(o.target_delivery_date)}
                                </span>
                              ) : (
                                <span className="text-[#747775] dark:text-[#8e918f] italic">SLA Standar 14h</span>
                              )}
                            </td>
                          )}

                          {/* Received Date at Outlet */}
                          {visibleRoColumns.received_date !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {o.arrival_datetime ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span>{formatDateSlash(o.arrival_datetime)}</span>
                                </span>
                              ) : o.slaCategory === 'COMPLETED' ? (
                                <span className="text-amber-600 dark:text-amber-400 italic font-semibold" title="RO sudah selesai tetapi tanggal diterima outlet tidak tercatat">
                                  Tgl tidak tercatat
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Belum Diterima</span>
                              )}
                            </td>
                          )}

                          {/* SLA Status Badge */}
                          {visibleRoColumns.sla_status !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                o.slaCategory === 'OVERDUE' || (o.slaCategory === 'COMPLETED' && o.isLateCompletion)
                                  ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                                  : o.slaCategory === 'CRITICAL'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
                                  : o.slaCategory === 'COMPLETED'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                              }`}>
                                {(o.slaCategory === 'OVERDUE' || (o.slaCategory === 'COMPLETED' && o.isLateCompletion)) && <ShieldAlert className="h-3 w-3 shrink-0" />}
                                {o.slaCategory === 'CRITICAL' && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                {o.slaCategory === 'ON_TIME' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                {o.slaCategory === 'COMPLETED' && !o.isLateCompletion && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                <span>{o.slaLabel}</span>
                              </span>
                            </td>
                          )}

                          {/* Item Fulfillment Progress */}
                          {visibleRoColumns.fulfillment !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-[#e0e2ec] dark:bg-[#444746] h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      o.fulfillmentPct >= 100
                                        ? 'bg-emerald-600'
                                        : o.fulfillmentPct > 0
                                        ? 'bg-amber-500'
                                        : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                    style={{ width: `${o.fulfillmentPct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold">
                                  {o.totalQtyFulfilled}/{o.totalQtyOrdered}
                                </span>
                                <span className="text-[10px] text-[#747775]">({o.fulfillmentPct}%)</span>
                              </div>
                            </td>
                          )}

                          {/* Stage */}
                          {visibleRoColumns.stage !== false && (
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] border border-[#e0e2ec] dark:border-[#444746]">
                                {o.current_stage || o.status}
                              </span>
                            </td>
                          )}

                          {/* Action Detail */}
                          {visibleRoColumns.actions !== false && (
                            <td className="py-3 px-3.5 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRoDetail(o);
                                }}
                                className="p-1 rounded-lg text-[#0b57d0] hover:bg-blue-50 dark:hover:bg-blue-950/50"
                                title="Lihat Detail Item RO"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="p-3 border-t border-[#e0e2ec] dark:border-[#444746] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-[#444746] dark:text-[#c4c7c5]">
                <div className="flex items-center gap-2">
                  <span>Menampilkan {paginatedOrders.length} dari {finalFilteredOrders.length} dokumen RO terfilter</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-2 py-1 text-xs"
                  >
                    <option value={10}>10 per hal</option>
                    <option value={25}>25 per hal</option>
                    <option value={50}>50 per hal</option>
                    <option value={100}>100 per hal</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] disabled:opacity-40 text-xs font-semibold"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-2 font-bold text-xs">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#282a2c] disabled:opacity-40 text-xs font-semibold"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ITEM BUTUH TINDAK LANJUT SEGERA (OVERDUE ACTION) */}
      {activeTab === 'OVERDUE_ACTION' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm">
                <ShieldAlert className="h-5 w-5" />
                <span>Pusat Eskalasi Keterlambatan Pengadaan & Distribusi</span>
              </div>
              <p className="text-xs text-rose-900/80 dark:text-rose-200 mt-1">
                Daftar item RO & pengadaan aset yang telah melewati tanggal permintaan target atau SLA &gt; 14 hari {selectedBranches.length > 0 && `(Outlet: ${selectedBranches.join(', ')})`}.
              </p>
            </div>
            <button
              onClick={handleExportOverdue}
              className="interactive-tap inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-700 text-white font-bold text-xs hover:bg-rose-800 transition-colors shadow-xs shrink-0 self-start md:self-auto"
            >
              <Download className="h-4 w-4" />
              <span>Unduh Daftar Follow-up (CSV)</span>
            </button>
          </div>

          {/* Overdue Item Table */}
          <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
            <div className="p-3.5 border-b border-[#e0e2ec] dark:border-[#444746] font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between">
              <span>1. Item RO Melewati Tanggal Permintaan Target</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold">
                {baseFilteredItems.filter((it) => it.slaCategory === 'OVERDUE' && !isItemClosedForFollowUp(it)).length} Baris Item
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                  <tr>
                    <th className="py-2.5 px-3">Nama Item</th>
                    <th className="py-2.5 px-3">No. RO</th>
                    <th className="py-2.5 px-3">Cabang Outlet</th>
                    <th className="py-2.5 px-3">Tgl Target</th>
                    <th className="py-2.5 px-3">Keterlambatan</th>
                    <th className="py-2.5 px-3">Qty</th>
                    <th className="py-2.5 px-3">Jumlah yang Diterima</th>
                    <th className="py-2.5 px-3">Tahap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {baseFilteredItems.filter((it) => it.slaCategory === 'OVERDUE' && !isItemClosedForFollowUp(it)).slice(0, 30).map((it) => (
                    <tr key={`${it.roId}::${it.id}`} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
                      <td className="py-2.5 px-3 font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</td>
                      <td className="py-2.5 px-3 font-semibold text-rose-700 dark:text-rose-400">{it.ro_number}</td>
                      <td className="py-2.5 px-3 font-medium">{it.branch_name}</td>
                      <td className="py-2.5 px-3">{formatDateSlash(it.target_delivery_date)}</td>
                      <td className="py-2.5 px-3 font-black text-rose-700 dark:text-rose-400">+{it.diffDays} Hari</td>
                      <td className="py-2.5 px-3 font-semibold">{it.quantity_fulfilled}/{it.quantity_ordered}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                          {it.received_quantity} dari {it.quantity_ordered} unit
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200">
                          {it.current_stage || it.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overdue Asset Procurement Table */}
          {overdueAssetItems.length > 0 && (
            <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
              <div className="p-3.5 border-b border-[#e0e2ec] dark:border-[#444746] font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between">
                <span>2. Pengadaan Aset Melewati SLA &gt; 14 Hari</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold">
                  {overdueAssetItems.length} Item
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                    <tr>
                      <th className="py-2.5 px-3">Waktu Order</th>
                      <th className="py-2.5 px-3">Cabang Outlet</th>
                      <th className="py-2.5 px-3">Nama Item</th>
                      <th className="py-2.5 px-3">Vendor</th>
                      <th className="py-2.5 px-3">Durasi Berjalan</th>
                      <th className="py-2.5 px-3">Status Pengiriman</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                    {overdueAssetItems.slice(0, 20).map((it) => (
                      <tr key={`${it.id}::${it.external_id || ''}`} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
                        <td className="py-2.5 px-3 whitespace-nowrap">{formatDateSlash(it.order_datetime)}</td>
                        <td className="py-2.5 px-3 font-semibold">{it.branch_name}</td>
                        <td className="py-2.5 px-3">{it.item_name}</td>
                        <td className="py-2.5 px-3 text-[#747775]">{it.vendor_name || '-'}</td>
                        <td className="py-2.5 px-3 font-black text-rose-700 dark:text-rose-400">
                          {formatLeadTime(it.lead_time_days)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200">
                            {it.item_delivery_status || 'Dalam Proses'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SLA PENGADAAN ASET (LEAD TIME VENDOR & CABANG) */}
      {activeTab === 'ASSET_SLA' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1c1e] border border-[#e0e2ec] dark:border-[#444746]">
            <h2 className="text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mb-1">
              Rincian Pemantauan SLA Pengadaan Aset per Item
            </h2>
            <p className="text-xs text-[#747775] dark:text-[#8e918f]">
              Durasi dihitung dari tanggal pengajuan order hingga konfirmasi penerimaan fisik di cabang.
            </p>
          </div>

          <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                  <tr>
                    <th className="py-3 px-3.5">Tgl Order</th>
                    <th className="py-3 px-3.5">Cabang</th>
                    <th className="py-3 px-3.5">Nama Item Aset</th>
                    <th className="py-3 px-3.5">Vendor</th>
                    <th className="py-3 px-3.5">Lead Time</th>
                    <th className="py-3 px-3.5">Status SLA</th>
                    <th className="py-3 px-3.5">Status Pengiriman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {initialAssetRequests
                    .filter((it) => matchesRegion(it.region, selectedRegion) && (selectedBranches.length === 0 || selectedBranches.includes((it.branch_name || '').trim())))
                    .slice(0, 50)
                    .map((it) => {
                      const isOver = it.lead_time_days > 14;
                      return (
                        <tr key={`${it.id}::${it.external_id || ''}`} className="hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]/60">
                          <td className="py-2.5 px-3.5 whitespace-nowrap">{formatDateSlash(it.order_datetime)}</td>
                          <td className="py-2.5 px-3.5 font-medium">{it.branch_name}</td>
                          <td className="py-2.5 px-3.5 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</td>
                          <td className="py-2.5 px-3.5">{it.vendor_name || '-'}</td>
                          <td className="py-2.5 px-3.5 font-bold">
                            {formatLeadTime(it.lead_time_days)}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isOver 
                                ? 'bg-rose-50 text-rose-800 border-rose-200' 
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {isOver ? '> 14 Hari (Terlambat)' : '&le; 14 Hari (On-Time)'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                              {it.item_delivery_status || 'Menunggu'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL DETAIL RO SAAT BARIS DIKLIK */}
      {selectedRoDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1a1c1e] rounded-2xl max-w-2xl w-full border border-[#e0e2ec] dark:border-[#444746] shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#e0e2ec] dark:border-[#444746] flex items-center justify-between bg-[#f8fafd] dark:bg-[#282a2c]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-[#1f1f1f] dark:text-[#e3e3e3]">
                    Detail SLA Dokumen {selectedRoDetail.ro_number}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
                    {selectedRoDetail.region}
                  </span>
                </div>
                <p className="text-xs text-[#747775] dark:text-[#8e918f] mt-0.5">
                  Cabang Outlet: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{selectedRoDetail.branch_name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoDetail(null)}
                className="p-1 rounded-full text-[#747775] hover:bg-[#e0e2ec] dark:hover:bg-[#444746] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal SLA Status Summary */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#f0f4f9]/50 dark:bg-[#202225] border-b border-[#e0e2ec] dark:border-[#444746] text-xs">
              <div>
                <div className="text-[10px] text-[#747775] uppercase font-bold">Tanggal Input</div>
                <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                  {formatDateSlash(selectedRoDetail.request_date)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#747775] uppercase font-bold">Target Permintaan</div>
                <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                  {formatDateSlash(selectedRoDetail.target_delivery_date)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#747775] uppercase font-bold">Tgl Diterima Outlet</div>
                <div className={`font-bold mt-0.5 ${
                  selectedRoDetail.arrival_datetime
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : selectedRoDetail.slaCategory === 'COMPLETED'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[#747775] dark:text-[#8e918f]'
                }`}>
                  {selectedRoDetail.arrival_datetime
                    ? formatDateSlash(selectedRoDetail.arrival_datetime)
                    : selectedRoDetail.slaCategory === 'COMPLETED'
                    ? 'Tidak tercatat'
                    : 'Belum diterima'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#747775] uppercase font-bold">Status SLA</div>
                <div className="font-bold mt-0.5 text-rose-600 dark:text-rose-400">
                  {selectedRoDetail.slaLabel}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#747775] uppercase font-bold">Pemenuhan</div>
                <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {selectedRoDetail.totalQtyFulfilled} / {selectedRoDetail.totalQtyOrdered} ({selectedRoDetail.fulfillmentPct}%)
                </div>
              </div>
            </div>

            {/* Modal Items List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <h4 className="font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                Daftar Item dalam Dokumen RO ({selectedRoDetailActiveItems.length} Item)
              </h4>
              {selectedRoDetailCancelledCount > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5">
                  {selectedRoDetailCancelledCount} item dibatalkan tidak dihitung dalam total item dan pemenuhan.
                </p>
              )}
              <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60 border border-[#e0e2ec] dark:border-[#444746] rounded-xl overflow-hidden text-xs">
                {selectedRoDetailActiveItems.map((it, idx) => (
                  <div key={it.id || idx} className="p-3 flex items-center justify-between hover:bg-[#f8fafd] dark:hover:bg-[#282a2c]/40">
                    <div>
                      <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</div>
                      <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                        Alokasi: <span className="font-semibold">{it.stock_source || 'ON_PROSES'}</span>
                        {it.pr_vendor_name && ` • Vendor: ${it.pr_vendor_name}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xs">
                        {it.quantity_fulfilled || 0} / {it.quantity_ordered} {it.unit || 'Unit'}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (it.quantity_fulfilled || 0) >= it.quantity_ordered 
                          ? 'bg-emerald-100 text-emerald-900' 
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        {(it.quantity_fulfilled || 0) >= it.quantity_ordered ? 'Lengkap' : 'Menunggu'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-[#e0e2ec] dark:border-[#444746] flex items-center justify-end bg-[#f8fafd] dark:bg-[#282a2c]">
              <button
                type="button"
                onClick={() => setSelectedRoDetail(null)}
                className="px-4 py-1.5 rounded-full bg-[#1f1f1f] text-white dark:bg-white dark:text-[#1f1f1f] text-xs font-semibold hover:opacity-90"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
