import React from 'react';
import { UpcomingOpeningsCard } from '@/components/dashboard/UpcomingOpeningsCard';
import { ExecutiveKpiCards } from '@/components/dashboard/ExecutiveKpiCards';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';
import { getBranchOpeningSummaries, getAssetRequests, getRequestOrders, getSuratJalanList } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const [branchSummaries, assetResponse, allRos, allSj] = await Promise.all([
    getBranchOpeningSummaries(region),
    getAssetRequests({ region, limit: 10000 }),
    getRequestOrders(),
    getSuratJalanList(),
  ]);

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

      {/* 1. Ringkasan Eksekutif KPI */}
      <ExecutiveKpiCards
        totalAssets={assetResponse.total || assetResponse.data.length}
        totalEstimatedValue={totalEstimatedValue}
        roStats={roStats}
        sjStats={sjStats}
        upcomingBranchesCount={upcomingBranches.length}
        avgReadiness={avgReadiness}
      />

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

        <AssetDataTable initialItems={assetResponse.data} regionFilter={region} />
      </div>
    </div>
  );
}
