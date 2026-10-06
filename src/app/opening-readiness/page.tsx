import React from 'react';
import { getBranchOpeningSummaries, getAssetRequests } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Store, Calendar, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { formatDateOnly } from '@/lib/utils/date-formatter';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';
import AreaFilterPills from '@/components/ui/AreaFilterPills';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string; branch?: string; filter?: string }>;
}

export default async function OpeningReadinessPage({ searchParams }: PageProps) {
  const { region: rawRegion, branch: selectedBranch, filter: rawFilter } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';
  const filter = rawFilter || 'ALL';

  const allBranchSummaries = await getBranchOpeningSummaries(region);

  const criticalH3List = allBranchSummaries.filter(
    (b) => (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
           (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100)
  );

  const urgentH7List = allBranchSummaries.filter(
    (b) => b.days_until_opening !== null && b.days_until_opening > 3 && b.days_until_opening <= 7 && b.readiness_percentage < 100
  );

  const completedList = allBranchSummaries.filter((b) => b.readiness_percentage >= 100);

  const branchSummaries = allBranchSummaries.filter((b) => {
    if (filter === 'CRITICAL') {
      return (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
             (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100);
    }
    if (filter === 'URGENT') {
      return b.days_until_opening !== null && b.days_until_opening > 3 && b.days_until_opening <= 7 && b.readiness_percentage < 100;
    }
    if (filter === 'READY') {
      return b.readiness_percentage >= 100;
    }
    return true;
  });

  const activeBranch = selectedBranch || (branchSummaries.length > 0 ? branchSummaries[0].branch_name : (allBranchSummaries.length > 0 ? allBranchSummaries[0].branch_name : ''));

  const { data: branchItems } = await getAssetRequests({
    region,
    branch: activeBranch || undefined,
    limit: 500,
  });

  const activeBranchSummary = allBranchSummaries.find((b) => b.branch_name === activeBranch);

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
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
        <div className="flex items-center gap-2">
          <a
            href="/sla-analytics"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 transition"
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            Monitoring SLA RO &rarr;
          </a>
          <a
            href="/outlets"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Master Outlet &rarr;
          </a>
        </div>
      </div>

      {/* SLA H-3 Critical Alert Banner if any critical */}
      {criticalH3List.length > 0 && (
        <div className="p-4 rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200 shrink-0">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                  Peringatan SLA Kritis H-3 ({criticalH3List.length} Cabang Perlu Eskalasi)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white tracking-wider animate-pulse">
                  Emergency
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                Target pembukaan outlet &le; 3 hari ke depan namun kesiapan barang belum 100%: {' '}
                <strong>{criticalH3List.map((c) => `${c.branch_name} (${c.readiness_percentage}%)`).join(', ')}</strong>
              </p>
            </div>
          </div>
          <a
            href={`/opening-readiness?filter=CRITICAL${region !== 'ALL' ? `&region=${region}` : ''}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs shrink-0 self-start sm:self-auto"
          >
            <span>Fokus Cabang Kritis</span>
          </a>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={`/opening-readiness?filter=ALL${region !== 'ALL' ? `&region=${region}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === 'ALL'
                ? 'bg-[#0b57d0] text-white shadow-2xs'
                : 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Semua Cabang ({allBranchSummaries.length})
          </a>
          <a
            href={`/opening-readiness?filter=CRITICAL${region !== 'ALL' ? `&region=${region}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
              filter === 'CRITICAL'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            <span>Kritis H-3 ({criticalH3List.length})</span>
          </a>
          <a
            href={`/opening-readiness?filter=URGENT${region !== 'ALL' ? `&region=${region}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
              filter === 'URGENT'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 hover:bg-amber-100'
            }`}
          >
            <span>Target H-7 ({urgentH7List.length})</span>
          </a>
          <a
            href={`/opening-readiness?filter=READY${region !== 'ALL' ? `&region=${region}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 ${
              filter === 'READY'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            <span>Siap 100% ({completedList.length})</span>
          </a>
        </div>
      </div>

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {branchSummaries.map((b) => {
          const isSelected = b.branch_name === activeBranch;
          const isCriticalH3 = (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
                               (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100);
          const isUrgentH7 = b.days_until_opening !== null && b.days_until_opening > 3 && b.days_until_opening <= 7 && b.readiness_percentage < 100;
          const isPassed = b.days_until_opening !== null && b.days_until_opening < 0;

          return (
            <a
              key={`${b.region}-${b.branch_name}`}
              href={`/opening-readiness?branch=${encodeURIComponent(b.branch_name)}${region !== 'ALL' ? `&region=${region}` : ''}${filter !== 'ALL' ? `&filter=${filter}` : ''}`}
              className={`rounded-2xl p-4 border transition-all cursor-pointer block ${
                isSelected
                  ? 'border-[#0b57d0] dark:border-[#a8c7fa] bg-[#e8f0fe]/60 dark:bg-[#004a77]/30 shadow-md ring-1 ring-[#0b57d0]'
                  : isCriticalH3
                  ? 'border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/30 hover:border-rose-500 shadow-2xs'
                  : 'border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] hover:border-[#0b57d0] dark:hover:border-[#a8c7fa]'
              }`}
            >
              {isCriticalH3 && (
                <div className="flex items-center justify-between text-[10px] font-bold text-rose-700 dark:text-rose-300 mb-2 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900 animate-pulse">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>KRITIS H-3: Target Dekat & Aset Belum Lengkap</span>
                  </span>
                </div>
              )}
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
                      (isCriticalH3 || isUrgentH7)
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
