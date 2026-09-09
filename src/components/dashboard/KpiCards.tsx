import React from 'react';
import { 
  Package, 
  Store, 
  Clock, 
  Boxes 
} from 'lucide-react';
import { DashboardMetrics } from '@/lib/supabase/types';
import { formatLeadTime } from '@/lib/utils/date-formatter';

interface KpiCardsProps {
  metrics: DashboardMetrics;
}

export function KpiCards({ metrics }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Permohonan & Item */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total Permohonan
          </span>
          <Package className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-white tracking-tight">
            {metrics.total_requests.toLocaleString('id-ID')}
            <span className="ml-1 text-xs font-normal text-slate-400">pengajuan</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
            <span>Total Kebutuhan:</span>
            <span className="font-semibold text-slate-200">{metrics.total_items.toLocaleString('id-ID')} unit</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>Status Selesai:</span>
            <span className="font-semibold text-emerald-400">
              {metrics.completed_count.toLocaleString('id-ID')} (
              {metrics.total_requests > 0
                ? Math.round((metrics.completed_count / metrics.total_requests) * 100)
                : 0}
              %)
            </span>
          </div>
        </div>
      </div>

      {/* 2. Kesiapan Outlet Baru */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Kesiapan Opening Outlet
          </span>
          <Store className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-cyan-400 tracking-tight">
            {metrics.avg_branch_readiness}%
            <span className="ml-1 text-xs font-normal text-slate-400">rata-rata siap</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
            <span>Opening 60 Hari ke Depan:</span>
            <span className="font-semibold text-slate-200">{metrics.upcoming_openings_count} Cabang</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>Item Dalam Proses:</span>
            <span className="font-semibold text-amber-400">{metrics.in_progress_count} item</span>
          </div>
        </div>
      </div>

      {/* 3. SLA Rata-rata Pengadaan */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Rata-rata SLA Pengadaan
          </span>
          <Clock className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-amber-400 tracking-tight">
            {formatLeadTime(metrics.avg_lead_time_days)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
            <span>On-Time (&le; 14 hari):</span>
            <span className="font-semibold text-emerald-400">{metrics.sla_on_time_count} item</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>Lewat Target (&gt; 14 hari):</span>
            <span className="font-semibold text-rose-400">{metrics.sla_delayed_count} item</span>
          </div>
        </div>
      </div>

      {/* 4. Pemenuhan Stok Gudang */}
      <div className="panel-card p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Alokasi Stok Gudang
          </span>
          <Boxes className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-3">
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {metrics.stock_fulfillment_rate}%
            <span className="ml-1 text-xs font-normal text-slate-400">dari stok gudang</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
            <span>Dari Stok Ready:</span>
            <span className="font-semibold text-emerald-400">{metrics.fulfilled_from_stock.toLocaleString('id-ID')} unit</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>Beli Baru (PR):</span>
            <span className="font-semibold text-slate-200">{metrics.fulfilled_from_pr.toLocaleString('id-ID')} unit</span>
          </div>
        </div>
      </div>
    </div>
  );
}
