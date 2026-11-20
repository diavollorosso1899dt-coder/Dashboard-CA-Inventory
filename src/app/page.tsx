import React from 'react';
import Link from 'next/link';
import { UpcomingOpeningsCard } from '@/components/dashboard/UpcomingOpeningsCard';
import { DashboardLiveProvider } from '@/components/dashboard/DashboardLiveProvider';
import { ExecutiveKpiCards } from '@/components/dashboard/ExecutiveKpiCards';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';
import { getAssetRequests, getRequestOrders, getSuratJalanStatusRows } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { buildBranchOpeningSummaries } from '@/lib/dashboard/branch-summaries';
import { getDaysRemaining } from '@/lib/utils/date-formatter';
import { Layers, ClipboardCheck, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const [assetResponse, allRos, sjRows] = await Promise.all([
    getAssetRequests({ region, limit: 10000, fresh: true }),
    getRequestOrders(true),
    // Hanya kolom status/region: jangan unduh items SJ yang berisi base64.
    getSuratJalanStatusRows(region),
  ]);

  const branchSummaries = buildBranchOpeningSummaries(assetResponse.data, getDaysRemaining);

  const filteredRos = region === 'ALL' ? allRos : allRos.filter((r) => r.region === region);
  const filteredSj = sjRows;

  const roStats = {
    total: filteredRos.length,
    readyStock: filteredRos.filter((r) => r.status === 'READY_STOCK' || r.current_stage === 'READY_STOCK').length,
    needPr: filteredRos.filter((r) => r.status === 'NEED_PR' || r.current_stage === 'KELOLA_PR').length,
    inDelivery: filteredRos.filter((r) => r.status === 'IN_DELIVERY' || r.current_stage === 'SURAT_JALAN').length,
    cancelled: filteredRos.filter((r) => r.status === 'REJECTED' || (r.status as string) === 'CANCELLED' || r.current_stage === 'DIBATALKAN').length,
  };

  const sjStats = {
    total: filteredSj.length,
    inDelivery: filteredSj.filter((s) => s.status === 'Dalam Pengiriman' || s.status === 'SHIPPED').length,
    delivered: filteredSj.filter((s) => s.status === 'Selesai' || s.status === 'DELIVERED').length,
  };

  const upcomingBranches = branchSummaries.filter(
    (b) => b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 30
  );
  const avgReadiness = branchSummaries.length > 0
    ? Math.round(branchSummaries.reduce((sum, b) => sum + (b.readiness_percentage || 0), 0) / branchSummaries.length)
    : 0;

  const totalEstimatedValue = assetResponse.data.reduce(
    (sum, a) => sum + Number(a.rab_total || a.deal_price || a.rab_price || 0),
    0
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Dashboard HANTARAN
            </h1>
            <span className="rounded-full bg-[#e8f0fe] dark:bg-[#004a77] px-3 py-0.5 text-xs font-semibold text-[#0b57d0] dark:text-[#c2e7ff]">
              {region === 'ALL' ? 'Semua Wilayah' : region}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
             Monitoring terpusat permohonan aset, durasi SLA, dan kesiapan outlet baru.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="rounded-lg bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <ClipboardCheck aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Stock Opname Harian</h2>
            <p className="mt-0.5 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              Cocokkan stok fisik dengan mutasi RO dan penerimaan. Pindai barcode dengan kamera perangkat.
            </p>
          </div>
        </div>
        <Link
          href="/stock-opname"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-blue-200 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950 dark:focus-visible:outline-blue-300"
        >
          <span>Buka Stock Opname</span>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {/* 1. Ringkasan Eksekutif KPI */}
      <ExecutiveKpiCards
        totalAssets={assetResponse.total || assetResponse.data.length}
        totalEstimatedValue={totalEstimatedValue}
        roStats={roStats}
        sjStats={sjStats}
        upcomingBranchesCount={upcomingBranches.length}
        avgReadiness={avgReadiness}
      />

      <DashboardLiveProvider key={region} initialItems={assetResponse.data} region={region}>
        {/* 2. Jadwal Opening Outlet */}
        <UpcomingOpeningsCard branches={branchSummaries} />

        {/* 2. Tabel Pemantauan Permohonan Aset */}
        <div className="space-y-2.5 pt-1">
          <div>
            <h2 className="text-base font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              Daftar Permohonan dan Pelacakan Aset
            </h2>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
              Pilih baris untuk melihat detail spesifikasi item atau memperbarui status penerimaan barang ke database.
            </p>
          </div>

          <AssetDataTable regionFilter={region} />
        </div>
      </DashboardLiveProvider>
    </div>
  );
}
