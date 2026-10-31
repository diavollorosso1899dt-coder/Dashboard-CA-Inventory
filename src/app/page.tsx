import React from 'react';
import Link from 'next/link';
import { UpcomingOpeningsCard } from '@/components/dashboard/UpcomingOpeningsCard';
import { DashboardLiveProvider } from '@/components/dashboard/DashboardLiveProvider';
import { ExecutiveKpiCards } from '@/components/dashboard/ExecutiveKpiCards';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';
import { getAssetRequests, getRequestOrders, getSuratJalanList } from '@/lib/supabase/server';
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

  const [assetResponse, allRos, allSj] = await Promise.all([
    getAssetRequests({ region, limit: 10000, fresh: true }),
    getRequestOrders(true),
    getSuratJalanList(true),
  ]);

  const branchSummaries = buildBranchOpeningSummaries(assetResponse.data, getDaysRemaining);

  const filteredRos = region === 'ALL' ? allRos : allRos.filter((r) => r.region === region);
  const filteredSj = region === 'ALL' ? allSj : allSj.filter((s) => s.region === region);

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

      {/* Banner Akses Fitur Baru: Stock Opname Harian */}
      <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-indigo-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/20 backdrop-blur-md rounded-xl text-white shrink-0">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-400/20 text-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Fitur Baru Terintegrasi</span>
            </div>
            <h2 className="text-base font-bold">Stock Opname Harian (SO Harian)</h2>
            <p className="text-xs text-sky-100 max-w-xl">
              Rekonsiliasi mutasi harian RO, Penerimaan, dan cek fisik rak (Peralatan &amp; Perlengkapan Tetap) dengan scanner barcode kamera HP/PC.
            </p>
          </div>
        </div>
        <Link
          href="/stock-opname"
          className="px-4 py-2.5 bg-white text-indigo-700 hover:bg-sky-50 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
        >
          <span>Buka Modul SO</span>
          <ArrowRight className="w-4 h-4" />
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
