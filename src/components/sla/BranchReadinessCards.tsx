'use client';

import React, { useState, useMemo } from 'react';
import { 
  Store, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Package, 
  Search,
  Filter,
  BarChart3,
  Layers,
  Sparkles
} from 'lucide-react';
import { BranchOpeningSummary, RequestOrder, ROItem } from '@/lib/supabase/types';
import { StandardRegion, matchesRegion } from '@/lib/utils/region-helper';
import { formatDateOnly, formatDateSlash } from '@/lib/utils/date-formatter';

export interface BranchReadinessItem {
  branch_name: string;
  region: string;
  target_date: string | null;
  days_remaining: number | null;
  is_critical_h3: boolean;
  is_urgent_h7: boolean;
  is_passed: boolean;
  total_items: number;
  completed_items: number;
  partial_items: number;
  pending_items: number;
  pr_vendor_items: number;
  ready_stock_items: number;
  readiness_percentage: number;
  ro_count: number;
  critical_ro_count: number;
  overdue_ro_count: number;
}

interface BranchReadinessCardsProps {
  branchSummaries: BranchOpeningSummary[];
  enrichedOrders: Array<{
    id: string;
    ro_number: string;
    branch_name: string;
    region: 'JABODETABEK' | 'KALBAR';
    request_date: string;
    target_delivery_date: string | null;
    status: string;
    current_stage: string;
    items: ROItem[];
    totalQtyOrdered: number;
    totalQtyFulfilled: number;
    fulfillmentPct: number;
    slaCategory: 'OVERDUE' | 'CRITICAL' | 'ON_TIME' | 'COMPLETED';
    diffDays: number;
    slaLabel: string;
  }>;
  selectedRegion: StandardRegion;
  onSelectBranch: (branchName: string) => void;
  onFilterItemsByBranch: (branchName: string, status?: 'ALL' | 'CRITICAL' | 'OVERDUE') => void;
}

type FilterStatus = 'ALL' | 'CRITICAL_H3' | 'URGENT_H7' | 'IN_PROGRESS' | 'READY_100';

export default function BranchReadinessCards({
  branchSummaries = [],
  enrichedOrders = [],
  selectedRegion,
  onSelectBranch,
  onFilterItemsByBranch,
}: BranchReadinessCardsProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');

  // Compute unified branch readiness list by combining branchOpeningSummaries and RO data
  const combinedBranchList: BranchReadinessItem[] = useMemo(() => {
    const map = new Map<string, BranchReadinessItem>();

    // 1. Ingest Branch Opening Summaries (from asset requests)
    for (const b of branchSummaries) {
      if (!b.branch_name) continue;
      const key = `${b.region.trim().toUpperCase()}__${b.branch_name.trim().toLowerCase()}`;
      const isCritical = (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
                         (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100);
      const isUrgent = b.days_until_opening !== null && b.days_until_opening > 3 && b.days_until_opening <= 7 && b.readiness_percentage < 100;
      const isPassed = b.days_until_opening !== null && b.days_until_opening < 0;

      map.set(key, {
        branch_name: b.branch_name.trim(),
        region: b.region.trim(),
        target_date: b.target_opening_date,
        days_remaining: b.days_until_opening,
        is_critical_h3: isCritical,
        is_urgent_h7: isUrgent,
        is_passed: isPassed,
        total_items: b.total_items_needed,
        completed_items: b.items_completed,
        partial_items: b.items_partial,
        pending_items: b.items_pending,
        pr_vendor_items: 0,
        ready_stock_items: b.items_completed,
        readiness_percentage: b.readiness_percentage,
        ro_count: 0,
        critical_ro_count: 0,
        overdue_ro_count: 0,
      });
    }

    // 2. Enrich with Request Orders data
    for (const ro of enrichedOrders) {
      if (!ro.branch_name) continue;
      const key = `${ro.region.trim().toUpperCase()}__${ro.branch_name.trim().toLowerCase()}`;
      
      let entry = map.get(key);
      if (!entry) {
        // Find nearest target delivery date for branches not in asset opening list
        const daysLeft = ro.target_delivery_date 
          ? Math.round((new Date(ro.target_delivery_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const isCritical = (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && ro.fulfillmentPct < 100) ||
                           (daysLeft !== null && daysLeft < 0 && ro.fulfillmentPct < 100);
        const isUrgent = daysLeft !== null && daysLeft > 3 && daysLeft <= 7 && ro.fulfillmentPct < 100;
        const isPassed = daysLeft !== null && daysLeft < 0;

        entry = {
          branch_name: ro.branch_name.trim(),
          region: ro.region.trim(),
          target_date: ro.target_delivery_date,
          days_remaining: daysLeft,
          is_critical_h3: isCritical,
          is_urgent_h7: isUrgent,
          is_passed: isPassed,
          total_items: 0,
          completed_items: 0,
          partial_items: 0,
          pending_items: 0,
          pr_vendor_items: 0,
          ready_stock_items: 0,
          readiness_percentage: 0,
          ro_count: 0,
          critical_ro_count: 0,
          overdue_ro_count: 0,
        };
        map.set(key, entry);
      }

      entry.ro_count += 1;
      if (ro.slaCategory === 'CRITICAL') entry.critical_ro_count += 1;
      if (ro.slaCategory === 'OVERDUE') entry.overdue_ro_count += 1;

      // Inspect RO items for stock allocation breakdown
      for (const it of ro.items || []) {
        entry.total_items += 1;
        const stock = it.stock_source || 'ON_PROSES';
        if (stock === 'GUDANG_SCGA' || (it.quantity_fulfilled || 0) >= (it.quantity_ordered || 0)) {
          entry.completed_items += 1;
          entry.ready_stock_items += 1;
        } else if (stock === 'PR_VENDOR') {
          entry.pr_vendor_items += 1;
        } else {
          entry.pending_items += 1;
        }
      }

      // If branch didn't have opening summary readiness, calculate from RO items
      if (entry.total_items > 0 && entry.readiness_percentage === 0) {
        entry.readiness_percentage = Math.round((entry.completed_items / entry.total_items) * 1000) / 10;
      }
    }

    const list = Array.from(map.values());

    // Sort by priority: Kritis H-3 first, then days remaining ascending
    return list.sort((a, b) => {
      if (a.is_critical_h3 && !b.is_critical_h3) return -1;
      if (!a.is_critical_h3 && b.is_critical_h3) return 1;
      if (a.days_remaining !== null && b.days_remaining !== null) {
        return a.days_remaining - b.days_remaining;
      }
      if (a.days_remaining !== null) return -1;
      if (b.days_remaining !== null) return 1;
      return b.total_items - a.total_items;
    });
  }, [branchSummaries, enrichedOrders]);

  // Filter based on selectedRegion
  const regionFilteredList = useMemo(() => {
    return combinedBranchList.filter((b) => matchesRegion(b.region, selectedRegion));
  }, [combinedBranchList, selectedRegion]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = regionFilteredList.length;
    const criticalH3 = regionFilteredList.filter((b) => b.is_critical_h3).length;
    const urgentH7 = regionFilteredList.filter((b) => b.is_urgent_h7).length;
    const ready100 = regionFilteredList.filter((b) => b.readiness_percentage >= 100).length;
    const inProgress = regionFilteredList.filter((b) => b.readiness_percentage < 100 && !b.is_critical_h3).length;

    const avgReadiness = total > 0
      ? Math.round(regionFilteredList.reduce((sum, b) => sum + b.readiness_percentage, 0) / total)
      : 0;

    return { total, criticalH3, urgentH7, ready100, inProgress, avgReadiness };
  }, [regionFilteredList]);

  // Filter based on search query and status tab
  const displayedList = useMemo(() => {
    const q = search.toLowerCase().trim();
    return regionFilteredList.filter((b) => {
      if (filterStatus === 'CRITICAL_H3' && !b.is_critical_h3) return false;
      if (filterStatus === 'URGENT_H7' && !b.is_urgent_h7) return false;
      if (filterStatus === 'IN_PROGRESS' && (b.readiness_percentage >= 100 || b.is_critical_h3)) return false;
      if (filterStatus === 'READY_100' && b.readiness_percentage < 100) return false;

      if (q) {
        const matchName = b.branch_name.toLowerCase().includes(q);
        const matchRegion = b.region.toLowerCase().includes(q);
        if (!matchName && !matchRegion) return false;
      }

      return true;
    });
  }, [regionFilteredList, search, filterStatus]);

  return (
    <div className="space-y-4">
      {/* 1. TOP KPI SUMMARY FOR BRANCH READINESS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Rata-rata Kesiapan Seluruh Cabang */}
        <div className="panel-card p-4 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider">
              Rata-rata Kesiapan Outlet
            </span>
            <Sparkles className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              {stats.avgReadiness}%
            </span>
            <span className="text-xs text-[#747775]">dari {stats.total} cabang</span>
          </div>
          <div className="w-full bg-[#f0f4f9] dark:bg-[#282a2c] h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
              style={{ width: `${Math.min(100, Math.max(5, stats.avgReadiness))}%` }}
            />
          </div>
          <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-2">
            Rata-rata pemenuhan barang siap di outlet
          </p>
        </div>

        {/* KPI 2: Cabang Kritis H-3 */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'CRITICAL_H3' ? 'ALL' : 'CRITICAL_H3')}
          className={`panel-card p-4 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            filterStatus === 'CRITICAL_H3'
              ? 'ring-2 ring-rose-500 border-rose-400 bg-rose-100/70 dark:bg-rose-950/50'
              : 'border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-900 dark:text-rose-300 uppercase tracking-wider">
              🚨 Kritis SLA H-3
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
              {stats.criticalH3}
            </span>
            <span className="text-xs text-rose-800/80 dark:text-rose-300/80 font-medium">cabang outlet</span>
          </div>
          <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-3 font-medium">
            Target &le; 3 hari &amp; barang belum 100% lengkap
          </p>
        </div>

        {/* KPI 3: Cabang Mendekati H-7 */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'URGENT_H7' ? 'ALL' : 'URGENT_H7')}
          className={`panel-card p-4 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            filterStatus === 'URGENT_H7'
              ? 'ring-2 ring-amber-500 border-amber-400 bg-amber-100/70 dark:bg-amber-950/50'
              : 'border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">
              ⚠️ Target H-7
            </span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-amber-700 dark:text-amber-400 tracking-tight">
              {stats.urgentH7}
            </span>
            <span className="text-xs text-amber-800/80 dark:text-amber-300/80 font-medium">cabang outlet</span>
          </div>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-3 font-medium">
            Masa persiapan kritis 4-7 hari menjelang target
          </p>
        </div>

        {/* KPI 4: Cabang Siap 100% */}
        <div 
          onClick={() => setFilterStatus(filterStatus === 'READY_100' ? 'ALL' : 'READY_100')}
          className={`panel-card p-4 rounded-2xl border cursor-pointer transition-all shadow-xs ${
            filterStatus === 'READY_100'
              ? 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/50'
              : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
              ✅ Siap 100%
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
              {stats.ready100}
            </span>
            <span className="text-xs text-emerald-800/80 dark:text-emerald-300/80 font-medium">cabang outlet</span>
          </div>
          <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-3 font-medium">
            Seluruh kebutuhan aset terpenuhi lengkap
          </p>
        </div>
      </div>

      {/* 2. TOOLBAR FILTERS & SEARCH */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#1a1c1e] border border-[#e0e2ec] dark:border-[#444746] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#747775]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama cabang outlet..."
            className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] pl-9 pr-4 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              filterStatus === 'ALL'
                ? 'bg-[#0b57d0] text-white shadow-2xs'
                : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-slate-200'
            }`}
          >
            Semua ({regionFilteredList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('CRITICAL_H3')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
              filterStatus === 'CRITICAL_H3'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>Kritis H-3 ({stats.criticalH3})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('URGENT_H7')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              filterStatus === 'URGENT_H7'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Target H-7 ({stats.urgentH7})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('READY_100')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
              filterStatus === 'READY_100'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Siap 100% ({stats.ready100})</span>
          </button>
        </div>
      </div>

      {/* 3. BRANCH CARDS GRID */}
      {displayedList.length === 0 ? (
        <div className="panel-card p-12 text-center rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e]">
          <Store className="h-8 w-8 mx-auto mb-2 opacity-40 text-[#747775]" />
          <p className="font-semibold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">Tidak ada cabang yang sesuai kriteria filter</p>
          <p className="text-xs text-[#747775] mt-1">Coba reset filter atau kata kunci pencarian</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedList.map((b) => {
            const isCritical = b.is_critical_h3;
            const isReady = b.readiness_percentage >= 100;

            // Calculate percentage slices for segmented progress bar
            const readyPct = b.total_items > 0 ? Math.round((b.ready_stock_items / b.total_items) * 100) : b.readiness_percentage;
            const prPct = b.total_items > 0 ? Math.round((b.pr_vendor_items / b.total_items) * 100) : 0;
            const pendingPct = Math.max(0, 100 - readyPct - prPct);

            return (
              <div
                key={`${b.region}-${b.branch_name}`}
                className={`panel-card rounded-2xl border p-4.5 transition-all flex flex-col justify-between shadow-xs ${
                  isCritical
                    ? 'border-rose-300 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30 ring-1 ring-rose-400/60'
                    : isReady
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10'
                    : 'border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] hover:border-[#0b57d0]'
                }`}
              >
                <div>
                  {/* Top Critical Header if H-3 */}
                  {isCritical && (
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-300 mb-2.5 bg-rose-100/90 dark:bg-rose-950/90 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 animate-pulse">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                        <span>ALERT SLA KRITIS (H-3)</span>
                      </span>
                      <span className="text-[10px] uppercase font-black tracking-wider">Perlu Eskalasi</span>
                    </div>
                  )}

                  {/* Branch Title & Region */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm md:text-base line-clamp-1" title={b.branch_name}>
                        {b.branch_name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5]">
                          {b.region}
                        </span>
                        {b.ro_count > 0 && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {b.ro_count} Dokumen RO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Countdown Badge */}
                    {b.days_remaining !== null ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0 ${
                          isCritical
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300'
                            : b.is_urgent_h7
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'
                            : b.is_passed
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-blue-50 text-[#0b57d0] dark:bg-[#004a77]/80 dark:text-[#c2e7ff] border border-blue-200'
                        }`}
                      >
                        {b.is_passed
                          ? `Lewat ${Math.abs(b.days_remaining)} Hari`
                          : b.days_remaining === 0
                          ? 'Hari Ini'
                          : `H-${b.days_remaining} Hari`}
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f0f4f9] text-[#747775]">
                        TBA
                      </span>
                    )}
                  </div>

                  {/* Target Date */}
                  <div className="flex items-center gap-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] mb-3">
                    <Calendar className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    <span>Target: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{formatDateOnly(b.target_date)}</strong></span>
                  </div>

                  {/* Readiness Metric & Segmented Progress Bar */}
                  <div className="space-y-1.5 p-3 rounded-xl bg-[#f8fafd] dark:bg-[#282a2c]/50 border border-[#e0e2ec] dark:border-[#444746]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5]">
                        Kesiapan Aset Cabang
                      </span>
                      <span className={`text-base font-black ${
                        b.readiness_percentage >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        b.readiness_percentage >= 50 ? 'text-amber-600 dark:text-amber-400' :
                        'text-rose-600 dark:text-rose-400'
                      }`}>
                        {b.readiness_percentage}%
                      </span>
                    </div>

                    {/* Segmented Progress Bar */}
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 flex">
                      {/* Ready Stock (Green) */}
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${readyPct}%` }}
                        title={`Ready Stock: ${readyPct}%`}
                      />
                      {/* PR Vendor (Blue) */}
                      {prPct > 0 && (
                        <div 
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${prPct}%` }}
                          title={`PR Vendor: ${prPct}%`}
                        />
                      )}
                      {/* Pending / On Proses (Rose/Amber) */}
                      {pendingPct > 0 && (
                        <div 
                          className="h-full bg-rose-400 dark:bg-rose-600 transition-all duration-300"
                          style={{ width: `${pendingPct}%` }}
                          title={`On Proses: ${pendingPct}%`}
                        />
                      )}
                    </div>

                    {/* Legend Breakdown */}
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] text-center">
                      <div className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded py-0.5 px-1 font-semibold">
                        Ready: {b.completed_items || b.ready_stock_items}
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 rounded py-0.5 px-1 font-semibold">
                        PR: {b.pr_vendor_items}
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 rounded py-0.5 px-1 font-semibold">
                        Proses: {b.pending_items}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className="mt-3.5 pt-3 border-t border-[#e0e2ec] dark:border-[#444746] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onFilterItemsByBranch(b.branch_name, 'ALL')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] text-[11px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] transition-colors"
                  >
                    <Package className="h-3.5 w-3.5 text-[#0b57d0]" />
                    <span>Lihat Semua Item ({b.total_items})</span>
                  </button>

                  {!isReady && (
                    <button
                      type="button"
                      onClick={() => onFilterItemsByBranch(b.branch_name, 'CRITICAL')}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition shadow-2xs"
                      title="Tinjau hanya item-item yang belum siap untuk cabang ini"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      <span>Item Belum Siap</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
