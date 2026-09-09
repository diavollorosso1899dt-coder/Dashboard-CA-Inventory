import React from 'react';
import { getBranchOpeningSummaries, getAssetRequests } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Store, Calendar } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils/date-formatter';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string; branch?: string }>;
}

export default async function OpeningReadinessPage({ searchParams }: PageProps) {
  const { region: rawRegion, branch: selectedBranch } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const branchSummaries = await getBranchOpeningSummaries(region);
  const activeBranch = selectedBranch || (branchSummaries.length > 0 ? branchSummaries[0].branch_name : '');

  const { data: branchItems } = await getAssetRequests({
    region,
    branch: activeBranch || undefined,
    limit: 500,
  });

  const activeBranchSummary = branchSummaries.find((b) => b.branch_name === activeBranch);

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Kesiapan Opening Outlet Baru
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Pelacakan kelengkapan barang dan aset per cabang menjelang target tanggal pembukaan.
        </p>
      </div>

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {branchSummaries.map((b) => {
          const isSelected = b.branch_name === activeBranch;
          const isUrgent = b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 14;
          const isPassed = b.days_until_opening !== null && b.days_until_opening < 0;

          return (
            <a
              key={`${b.region}-${b.branch_name}`}
              href={`/opening-readiness?branch=${encodeURIComponent(b.branch_name)}${region !== 'ALL' ? `&region=${region}` : ''}`}
              className={`rounded-2xl p-4 border transition-all cursor-pointer block ${
                isSelected
                  ? 'border-[#0b57d0] dark:border-[#a8c7fa] bg-[#e8f0fe]/60 dark:bg-[#004a77]/30 shadow-md'
                  : 'border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] hover:border-[#0b57d0] dark:hover:border-[#a8c7fa]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm line-clamp-1">{b.branch_name}</h3>
                  <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5]">
                    {b.region}
                  </span>
                </div>
                {b.days_until_opening !== null ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${
                      isUrgent
                        ? 'bg-[#fce8e6] dark:bg-[#601410]/80 text-[#b3261e] dark:text-[#f2b8b5] border border-[#f9dedc]'
                        : isPassed
                        ? 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#5f6368] dark:text-[#c4c7c5]'
                        : 'bg-[#e8f0fe] dark:bg-[#004a77]/80 text-[#0b57d0] dark:text-[#c2e7ff] border border-[#d2e3fc]'
                    }`}
                  >
                    {isPassed ? 'Selesai' : b.days_until_opening === 0 ? 'Hari Ini' : `H-${b.days_until_opening} Hari`}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-[#f0f4f9] dark:bg-[#282a2c] text-[#5f6368] dark:text-[#c4c7c5]">
                    TBA
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] my-2.5">
                <Calendar className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Target: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{formatDateOnly(b.target_opening_date)}</strong></span>
              </div>

              {/* Progress */}
              <div className="space-y-1.5 mt-2.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-[#444746] dark:text-[#c4c7c5]">Kesiapan Aset:</span>
                  <span className={`font-bold ${b.readiness_percentage >= 80 ? 'text-[#137333] dark:text-[#6dd58c]' : 'text-[#b06000] dark:text-[#ffb951]'}`}>
                    {b.readiness_percentage}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e0e2ec] dark:bg-[#444746]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      b.readiness_percentage >= 80
                        ? 'bg-[#137333] dark:bg-[#6dd58c]'
                        : b.readiness_percentage >= 50
                        ? 'bg-[#b06000] dark:bg-[#ffb951]'
                        : 'bg-[#b3261e] dark:bg-[#f2b8b5]'
                    }`}
                    style={{ width: `${Math.min(100, b.readiness_percentage)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[#444746] dark:text-[#c4c7c5] pt-0.5">
                  <span>Selesai: <strong className="text-[#137333] dark:text-[#6dd58c]">{b.items_completed}</strong></span>
                  <span>Belum: <strong className="text-[#b06000] dark:text-[#ffb951]">{b.items_pending}</strong></span>
                  <span>Total: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{b.total_items_needed}</strong> item</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Selected Branch Section */}
      {activeBranchSummary && (
        <div className="panel-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e0e2ec] dark:border-[#444746] pb-3.5">
            <div>
              <span className="text-[11px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5]">
                Detail Cabang Terpilih
              </span>
              <h2 className="text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{activeBranchSummary.branch_name}</h2>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
                Target Opening: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{formatDateOnly(activeBranchSummary.target_opening_date)}</strong> • Wilayah: {activeBranchSummary.region}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#1e1f20] p-3 border border-[#e0e2ec] dark:border-[#444746] text-center min-w-[90px]">
                <div className="text-[10px] text-[#747775] dark:text-[#8e918f]">Total Item</div>
                <div className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{activeBranchSummary.total_items_needed}</div>
              </div>
              <div className="rounded-2xl bg-[#e6f4ea] dark:bg-[#0f5223]/40 p-3 border border-[#ceead6] dark:border-[#0f5223] text-center min-w-[90px]">
                <div className="text-[10px] text-[#137333] dark:text-[#6dd58c] font-semibold">Lengkap</div>
                <div className="text-base font-bold text-[#137333] dark:text-[#6dd58c]">{activeBranchSummary.items_completed}</div>
              </div>
              <div className="rounded-2xl bg-[#fef7e0] dark:bg-[#4a2800]/40 p-3 border border-[#feeed9] dark:border-[#4a2800] text-center min-w-[90px]">
                <div className="text-[10px] text-[#b06000] dark:text-[#ffb951] font-semibold">Pending</div>
                <div className="text-base font-bold text-[#b06000] dark:text-[#ffb951]">{activeBranchSummary.items_pending}</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mb-2.5">
              Daftar Seluruh Item Aset: {activeBranchSummary.branch_name}
            </h3>
            <AssetDataTable initialItems={branchItems} regionFilter={region} />
          </div>
        </div>
      )}
    </div>
  );
}
