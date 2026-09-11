import React from 'react';
import { UpcomingOpeningsCard } from '@/components/dashboard/UpcomingOpeningsCard';
import { OperationalWorkflowCard } from '@/components/dashboard/OperationalWorkflowCard';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';
import { getBranchOpeningSummaries, getAssetRequests, getOperationalWorkflowSummary } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const [branchSummaries, assetResponse, workflowSummary] = await Promise.all([
    getBranchOpeningSummaries(region),
    getAssetRequests({ region, limit: 1000 }),
    getOperationalWorkflowSummary(region),
  ]);

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Dashboard Asset Control
            </h1>
            <span className="rounded-full bg-[#e8f0fe] dark:bg-[#004a77] px-3 py-0.5 text-xs font-semibold text-[#0b57d0] dark:text-[#c2e7ff]">
              {region === 'ALL' ? 'Semua Wilayah' : region}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
            Monitoring terpusat permohonan aset, alur operasional pengadaan, durasi SLA, dan kesiapan outlet baru.
          </p>
        </div>
      </div>

      {/* 1. Alur Operasional Pengadaan & Distribusi Aset */}
      <OperationalWorkflowCard summary={workflowSummary} region={region} />

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
