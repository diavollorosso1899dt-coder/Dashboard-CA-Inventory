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
  SlidersHorizontal
} from 'lucide-react';
import { RequestOrder, AssetRequest, RegionType, ROItem } from '@/lib/supabase/types';
import AreaFilterPills from '@/components/ui/AreaFilterPills';
import ColumnVisibilityPicker, { ColumnItem } from '@/components/ui/ColumnVisibilityPicker';
import { StandardRegion, matchesRegion, normalizeRegion } from '@/lib/utils/region-helper';
import { formatDateSlash, formatLeadTime } from '@/lib/utils/date-formatter';

interface InteractiveSlaDashboardProps {
  initialRoOrders: RequestOrder[];
  initialAssetRequests: AssetRequest[];
  metrics: {
    avg_lead_time_days: number;
    sla_on_time_count: number;
    sla_delayed_count: number;
  };
  initialRegion?: RegionType;
}

type SlaStatusFilter = 'ALL' | 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED';
type ActiveTab = 'RO_SLA' | 'OVERDUE_ACTION' | 'ASSET_SLA';

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
}

const SLA_COLUMNS: ColumnItem[] = [
  { id: 'ro_number', label: 'No. RO & Wilayah', alwaysVisible: true },
  { id: 'branch_name', label: 'Cabang Outlet' },
  { id: 'request_date', label: 'Tanggal Order' },
  { id: 'target_delivery_date', label: 'Target Permintaan' },
  { id: 'sla_status', label: 'Status SLA & Deadline' },
  { id: 'fulfillment', label: 'Pemenuhan Item' },
  { id: 'stage', label: 'Tahap Alur' },
  { id: 'actions', label: 'Aksi / Detail', alwaysVisible: true },
];

function formatMonthYear(ym: string): string {
  const parts = ym.split('-');
  if (parts.length < 2) return ym;
  const year = parts[0];
  const month = parts[1];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx] || month} ${year}`;
}

export default function InteractiveSlaDashboard({
  initialRoOrders = [],
  initialAssetRequests = [],
  metrics,
  initialRegion = 'ALL',
}: InteractiveSlaDashboardProps) {
  const [selectedRegion, setSelectedRegion] = useState<StandardRegion>(normalizeRegion(initialRegion));
  const [activeTab, setActiveTab] = useState<ActiveTab>('RO_SLA');
  
  // Column Level Filters
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<SlaStatusFilter>('ALL');
  const [search, setSearch] = useState('');
  
  // Column Visibility
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ca_sla_columns');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      ro_number: true,
      branch_name: true,
      request_date: true,
      target_delivery_date: true,
      sla_status: true,
      fulfillment: true,
      stage: true,
      actions: true,
    };
  });

  const [selectedRoDetail, setSelectedRoDetail] = useState<EnrichedRO | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const today = useMemo(() => new Date(), []);

  // 1. Process & Enrich RO data with SLA and target delivery calculations
  const enrichedOrders: EnrichedRO[] = useMemo(() => {
    return initialRoOrders.map((ro) => {
      const items = ro.items || [];
      const totalQtyOrdered = items.reduce((sum, it) => sum + (it.quantity_ordered || 0), 0);
      const totalQtyFulfilled = items.reduce((sum, it) => sum + (it.quantity_fulfilled || 0), 0);
      const fulfillmentPct = totalQtyOrdered > 0 ? Math.round((totalQtyFulfilled / totalQtyOrdered) * 100) : 0;

      const isCompleted = ro.status === 'COMPLETED' || ro.current_stage === 'SELESAI';
      const targetStr = ro.target_delivery_date;

      let slaCategory: 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED' = 'ON_TIME';
      let diffDays = 0;
      let slaLabel = 'Sesuai Target';

      if (isCompleted) {
        slaCategory = 'COMPLETED';
        slaLabel = 'Selesai Terpenuhi';
        if (targetStr) {
          const targetDate = new Date(targetStr);
          const doneDate = ro.arrival_datetime ? new Date(ro.arrival_datetime) : targetDate;
          const diff = Math.round((doneDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
          diffDays = diff;
          if (diff > 0) {
            slaLabel = `Selesai (+${diff} hari)`;
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
      };
    });
  }, [initialRoOrders, today]);

  // 2. Filter by Region first (Scope for options dropdowns)
  const regionOrders = useMemo(() => {
    return enrichedOrders.filter((o) => matchesRegion(o.region, selectedRegion));
  }, [enrichedOrders, selectedRegion]);

  // Options for Column Filter Dropdowns
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

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    regionOrders.forEach((o) => {
      if (o.request_date && o.request_date.length >= 7) {
        set.add(o.request_date.slice(0, 7));
      }
    });
    return Array.from(set).sort().reverse();
  }, [regionOrders]);

  // 3. Base Filtered Orders (Region + Branch + Stage + Month + Search)
  const baseFilteredOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    return enrichedOrders.filter((o) => {
      if (!matchesRegion(o.region, selectedRegion)) return false;
      if (selectedBranch !== 'ALL' && o.branch_name !== selectedBranch) return false;
      if (selectedStage !== 'ALL') {
        const st = o.current_stage || o.status;
        if (st !== selectedStage) return false;
      }
      if (selectedMonth !== 'ALL') {
        if (!o.request_date || !o.request_date.startsWith(selectedMonth)) return false;
      }
      if (q) {
        const matchRo = o.ro_number.toLowerCase().includes(q);
        const matchBranch = o.branch_name.toLowerCase().includes(q);
        const matchItem = o.items.some((it) => it.item_name.toLowerCase().includes(q));
        if (!matchRo && !matchBranch && !matchItem) return false;
      }
      return true;
    });
  }, [enrichedOrders, selectedRegion, selectedBranch, selectedStage, selectedMonth, search]);

  // 4. Final Table Orders (including Status Filter)
  const finalFilteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return baseFilteredOrders;
    return baseFilteredOrders.filter((o) => o.slaCategory === statusFilter);
  }, [baseFilteredOrders, statusFilter]);

  // 5. DYNAMIC KPI STATS: Calculated explicitly based on active filters!
  const kpiStats = useMemo(() => {
    // When a specific status filter is active, target set is that status subset,
    // but we also keep context totals for the fulfillment rate denominator.
    const activeSet = statusFilter === 'ALL' 
      ? baseFilteredOrders 
      : baseFilteredOrders.filter((o) => o.slaCategory === statusFilter);

    const totalRO = activeSet.length;
    const contextTotalRO = baseFilteredOrders.length;

    let completedCount = 0;
    let overdueCount = 0;
    let criticalCount = 0;
    let onTimeCount = 0;
    let totalItemsOrdered = 0;
    let totalItemsFulfilled = 0;
    let leadTimeDaysSum = 0;
    let leadTimeCount = 0;

    // We compute distributions from baseFilteredOrders so the user sees the full picture of the filtered scope (e.g. within a branch or month)
    baseFilteredOrders.forEach((o) => {
      totalItemsOrdered += o.totalQtyOrdered;
      totalItemsFulfilled += o.totalQtyFulfilled;

      if (o.slaCategory === 'COMPLETED') completedCount++;
      else if (o.slaCategory === 'OVERDUE') overdueCount++;
      else if (o.slaCategory === 'CRITICAL') criticalCount++;
      else onTimeCount++;

      // Compute lead time if request date and target/arrival exist
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

    const onTimeTotal = completedCount + onTimeCount;
    const fulfillmentRatePct = contextTotalRO > 0 ? Math.round((onTimeTotal / contextTotalRO) * 1000) / 10 : 0;
    const itemFulfillmentRatePct = totalItemsOrdered > 0 ? Math.round((totalItemsFulfilled / totalItemsOrdered) * 1000) / 10 : 0;
    const avgLeadTimeDays = leadTimeCount > 0 ? Math.round((leadTimeDaysSum / leadTimeCount) * 10) / 10 : metrics.avg_lead_time_days;

    return {
      totalRO,
      contextTotalRO,
      completedCount,
      overdueCount,
      criticalCount,
      onTimeCount,
      totalItemsOrdered,
      totalItemsFulfilled,
      fulfillmentRatePct,
      itemFulfillmentRatePct,
      avgLeadTimeDays,
    };
  }, [baseFilteredOrders, statusFilter, metrics.avg_lead_time_days]);

  // 6. Overdue Items from Asset Requests (> 14 days and still not completed)
  const overdueAssetItems = useMemo(() => {
    return initialAssetRequests.filter((it) => {
      if (!matchesRegion(it.region, selectedRegion)) return false;
      if (selectedBranch !== 'ALL' && it.branch_name !== selectedBranch) return false;
      const status = (it.item_delivery_status || '').toLowerCase();
      const isDone = status.includes('terima outlet') || status.includes('lengkap');
      return !isDone && it.lead_time_days > 14;
    });
  }, [initialAssetRequests, selectedRegion, selectedBranch]);

  // Pagination for RO Table
  const totalPages = Math.max(1, Math.ceil(finalFilteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return finalFilteredOrders.slice(start, start + pageSize);
  }, [finalFilteredOrders, currentPage, pageSize]);

  // Check if any filter is active
  const isAnyFilterActive = useMemo(() => {
    return (
      selectedRegion !== 'ALL' ||
      selectedBranch !== 'ALL' ||
      selectedStage !== 'ALL' ||
      selectedMonth !== 'ALL' ||
      statusFilter !== 'ALL' ||
      search.trim() !== ''
    );
  }, [selectedRegion, selectedBranch, selectedStage, selectedMonth, statusFilter, search]);

  const handleResetFilters = () => {
    setSelectedRegion('ALL');
    setSelectedBranch('ALL');
    setSelectedStage('ALL');
    setSelectedMonth('ALL');
    setStatusFilter('ALL');
    setSearch('');
    setCurrentPage(1);
  };

  // Export Overdue Items to CSV for immediate procurement follow-up
  const handleExportOverdue = () => {
    const overdueList = baseFilteredOrders.filter((o) => o.slaCategory === 'OVERDUE' || o.slaCategory === 'CRITICAL');
    if (overdueList.length === 0) {
      alert('Tidak ada data RO yang terlambat/kritis untuk diekspor pada filter aktif saat ini.');
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
              setSelectedBranch('ALL');
              setCurrentPage(1);
            }}
            syncUrl={true}
          />
          <button
            onClick={handleExportOverdue}
            className="interactive-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 transition-colors shadow-2xs"
            title="Download CSV daftar RO terlambat & kritis untuk koordinasi tim logistik/vendor"
          >
            <Download className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span>Ekspor Data Overdue</span>
          </button>
        </div>
      </div>

      {/* 2. DYNAMIC KPI CARDS (Calculated based on active filters!) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] uppercase tracking-wider">
              Ringkasan KPI SLA {isAnyFilterActive ? '(Sesuai Filter Aktif)' : '(Semua Data)'}
            </span>
          </div>
          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Semua Filter</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Ketepatan Pemenuhan (Target Permintaan) */}
          <div className="panel-card p-4 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] rounded-2xl relative overflow-hidden shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
                Ketepatan Pemenuhan
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                kpiStats.fulfillmentRatePct >= 80 
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' 
                  : kpiStats.fulfillmentRatePct >= 50
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
              }`}>
                {kpiStats.fulfillmentRatePct >= 80 ? 'Optimal' : kpiStats.fulfillmentRatePct >= 50 ? 'Waspada' : 'Perlu Atensi'}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
                {kpiStats.fulfillmentRatePct}%
              </span>
              <span className="text-xs text-[#747775] dark:text-[#8e918f]">
                sesuai target
              </span>
            </div>

            {/* Progress bar visual */}
            <div className="w-full bg-[#f0f4f9] dark:bg-[#282a2c] h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  kpiStats.fulfillmentRatePct >= 80 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : kpiStats.fulfillmentRatePct >= 50
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-rose-500 to-orange-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, kpiStats.fulfillmentRatePct))}%` }}
              />
            </div>

            <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-2">
              {kpiStats.completedCount + kpiStats.onTimeCount} dari {kpiStats.contextTotalRO} RO tepat waktu
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
                {kpiStats.overdueCount}
              </span>
              <span className="text-xs text-rose-800/80 dark:text-rose-300/80 font-medium">
                dokumen RO
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
                {kpiStats.criticalCount}
              </span>
              <span className="text-xs text-amber-800/80 dark:text-amber-300/80 font-medium">
                dokumen RO
              </span>
            </div>

            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-3 font-medium">
              Selesai diproses / persiapan kirim
            </p>
          </div>

          {/* Card 4: Total RO Terfilter & Rata-rata Lead Time */}
          <div className="panel-card p-4 border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] rounded-2xl shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
                Total RO Dipantau
              </span>
              <Package className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl font-black text-[#0b57d0] dark:text-[#a8c7fa] tracking-tight">
                {kpiStats.totalRO}
              </span>
              <span className="text-xs text-[#747775] dark:text-[#8e918f]">
                dokumen RO
              </span>
            </div>

            <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-3">
              Rata-rata lead time: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{formatLeadTime(kpiStats.avgLeadTimeDays)}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* 3. TABS NAVIGASI UTAMA */}
      <div className="flex items-center gap-2 border-b border-[#e0e2ec] dark:border-[#444746] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('RO_SLA')}
          className={`interactive-tap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'RO_SLA'
              ? 'bg-[#0b57d0] text-white shadow-sm'
              : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec]'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Pemantauan SLA Request Order ({finalFilteredOrders.length})</span>
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
          <span>Item Butuh Tindak Lanjut ({kpiStats.overdueCount + overdueAssetItems.length})</span>
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

      {/* TAB 1: PEMANTAUAN SLA REQUEST ORDER (RO) */}
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
                  placeholder="Cari nomor RO, cabang outlet, atau item..."
                  className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] pl-9 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              {/* Action Buttons: Column Visibility & Reset */}
              <div className="flex items-center gap-2 flex-wrap">
                <ColumnVisibilityPicker
                  columns={SLA_COLUMNS}
                  visibleColumns={visibleColumns}
                  onChange={setVisibleColumns}
                  storageKey="ca_sla_columns"
                  buttonLabel="Pilih Kolom"
                />

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

            {/* BARIS DROPDOWN FILTER KOLOM: CABANG, TAHAP, BULAN */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a]">
              {/* 1. Filter Kolom Cabang Outlet */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Kolom Cabang:</span>
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="ALL">Semua Cabang ({branchOptions.length} Outlet)</option>
                  {branchOptions.map((br) => (
                    <option key={br} value={br}>
                      {br}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Filter Kolom Periode Bulan Order */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Bulan Order:</span>
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="ALL">Semua Periode Bulan</option>
                  {monthOptions.map((ym) => (
                    <option key={ym} value={ym}>
                      {formatMonthYear(ym)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Filter Kolom Tahap Alur Kerja */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1">
                  <Truck className="h-3 w-3 text-[#0b57d0]" />
                  <span>Filter Tahap Alur:</span>
                </label>
                <select
                  value={selectedStage}
                  onChange={(e) => {
                    setSelectedStage(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="ALL">Semua Tahap Alur</option>
                  {stageOptions.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
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
                Semua ({baseFilteredOrders.length})
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
                <span>🔴 Terlambat ({kpiStats.overdueCount})</span>
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
                <span>🟡 Kritis (&le; 3h) ({kpiStats.criticalCount})</span>
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
                <span>🟢 Tepat Waktu ({kpiStats.onTimeCount})</span>
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
                <span>🔵 Selesai ({kpiStats.completedCount})</span>
              </button>
            </div>

            {/* Active Filter Indicators Bar */}
            {isAnyFilterActive && (
              <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                <span className="font-bold">Filter diterapkan:</span>
                {selectedRegion !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Wilayah: {selectedRegion}
                  </span>
                )}
                {selectedBranch !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Cabang: {selectedBranch}
                  </span>
                )}
                {selectedMonth !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Bulan: {formatMonthYear(selectedMonth)}
                  </span>
                )}
                {selectedStage !== 'ALL' && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#0b57d0] font-semibold border border-blue-200">
                    Tahap: {selectedStage}
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

          {/* TABLE CONTENT DENGAN COLUMN VISIBILITY */}
          <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
                <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                  <tr>
                    {visibleColumns.ro_number !== false && <th className="py-3 px-3.5">No. RO & Wilayah</th>}
                    {visibleColumns.branch_name !== false && <th className="py-3 px-3.5">Cabang Outlet</th>}
                    {visibleColumns.request_date !== false && <th className="py-3 px-3.5">Tgl Order</th>}
                    {visibleColumns.target_delivery_date !== false && <th className="py-3 px-3.5">Target Permintaan</th>}
                    {visibleColumns.sla_status !== false && <th className="py-3 px-3.5">Status SLA & Deadline</th>}
                    {visibleColumns.fulfillment !== false && <th className="py-3 px-3.5">Pemenuhan Item</th>}
                    {visibleColumns.stage !== false && <th className="py-3 px-3.5">Tahap Alur</th>}
                    {visibleColumns.actions !== false && <th className="py-3 px-3.5 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
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
                        {visibleColumns.ro_number !== false && (
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
                        {visibleColumns.branch_name !== false && (
                          <td className="py-3 px-3.5 font-medium max-w-[200px] truncate" title={o.branch_name}>
                            {o.branch_name}
                          </td>
                        )}

                        {/* Order Date */}
                        {visibleColumns.request_date !== false && (
                          <td className="py-3 px-3.5 whitespace-nowrap text-[#444746] dark:text-[#c4c7c5]">
                            {formatDateSlash(o.request_date)}
                          </td>
                        )}

                        {/* Target Delivery Date */}
                        {visibleColumns.target_delivery_date !== false && (
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

                        {/* SLA Status Badge */}
                        {visibleColumns.sla_status !== false && (
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                              o.slaCategory === 'OVERDUE'
                                ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                                : o.slaCategory === 'CRITICAL'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900'
                                : o.slaCategory === 'COMPLETED'
                                ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                            }`}>
                              {o.slaCategory === 'OVERDUE' && <ShieldAlert className="h-3 w-3 shrink-0" />}
                              {o.slaCategory === 'CRITICAL' && <AlertTriangle className="h-3 w-3 shrink-0" />}
                              {o.slaCategory === 'ON_TIME' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                              {o.slaCategory === 'COMPLETED' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                              <span>{o.slaLabel}</span>
                            </span>
                          </td>
                        )}

                        {/* Item Fulfillment Progress */}
                        {visibleColumns.fulfillment !== false && (
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
                        {visibleColumns.stage !== false && (
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] border border-[#e0e2ec] dark:border-[#444746]">
                              {o.current_stage || o.status}
                            </span>
                          </td>
                        )}

                        {/* Action Detail */}
                        {visibleColumns.actions !== false && (
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
                Daftar permohonan RO & pengadaan aset yang telah melewati tanggal permintaan target atau SLA &gt; 14 hari {selectedBranch !== 'ALL' && `(Cabang: ${selectedBranch})`}.
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

          {/* Overdue RO Table */}
          <div className="panel-card overflow-hidden border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e] shadow-xs">
            <div className="p-3.5 border-b border-[#e0e2ec] dark:border-[#444746] font-bold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center justify-between">
              <span>1. Request Order (RO) Melewati Tanggal Permintaan</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold">
                {baseFilteredOrders.filter((o) => o.slaCategory === 'OVERDUE').length} Dokumen
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f8fafd] dark:bg-[#282a2c]">
                  <tr>
                    <th className="py-2.5 px-3">No. RO</th>
                    <th className="py-2.5 px-3">Cabang Outlet</th>
                    <th className="py-2.5 px-3">Tgl Target Permintaan</th>
                    <th className="py-2.5 px-3">Hari Terlambat</th>
                    <th className="py-2.5 px-3">Item Belum Lengkap</th>
                    <th className="py-2.5 px-3">Tahap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                  {baseFilteredOrders.filter((o) => o.slaCategory === 'OVERDUE').slice(0, 20).map((o) => (
                    <tr key={o.id} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
                      <td className="py-2.5 px-3 font-bold text-rose-700 dark:text-rose-400">{o.ro_number}</td>
                      <td className="py-2.5 px-3 font-medium">{o.branch_name}</td>
                      <td className="py-2.5 px-3">{formatDateSlash(o.target_delivery_date)}</td>
                      <td className="py-2.5 px-3 font-black text-rose-700 dark:text-rose-400">+{o.diffDays} Hari</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                          {o.items.filter((it) => it.quantity_fulfilled < it.quantity_ordered).map((it) => it.item_name).join(', ') || 'Semua item pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200">
                          {o.current_stage || o.status}
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
                      <tr key={it.id} className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20">
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
                    .filter((it) => matchesRegion(it.region, selectedRegion) && (selectedBranch === 'ALL' || it.branch_name === selectedBranch))
                    .slice(0, 50)
                    .map((it) => {
                      const isOver = it.lead_time_days > 14;
                      return (
                        <tr key={it.id} className="hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]/60">
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
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f0f4f9]/50 dark:bg-[#202225] border-b border-[#e0e2ec] dark:border-[#444746] text-xs">
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
                Daftar Item dalam Dokumen RO ({selectedRoDetail.items.length} Item)
              </h4>
              <div className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60 border border-[#e0e2ec] dark:border-[#444746] rounded-xl overflow-hidden text-xs">
                {selectedRoDetail.items.map((it, idx) => (
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
