import React from 'react';
import Link from 'next/link';
import { Store, Calendar, ArrowRight, AlertTriangle } from 'lucide-react';
import { BranchOpeningSummary } from '@/lib/supabase/types';
import { formatDateOnly } from '@/lib/utils/date-formatter';

interface UpcomingOpeningsCardProps {
  branches: BranchOpeningSummary[];
}

export function UpcomingOpeningsCard({ branches }: UpcomingOpeningsCardProps) {
  const displayBranches = branches.slice(0, 6);

  const criticalBranches = branches.filter(
    (b) => (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
           (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100)
  );

  return (
    <div className="panel-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm md:text-base flex items-center gap-2">
            <Store className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
            Jadwal Pembukaan Outlet Baru
          </h3>
          <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
            Monitoring kesiapan dan progres kelengkapan aset per cabang
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticalBranches.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
              <AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
              {criticalBranches.length} Cabang Kritis H-3
            </span>
          )}
          <Link
            href="/opening-readiness"
            className="flex items-center gap-1 text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline transition-colors"
          >
            Lihat Semua ({branches.length})
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {displayBranches.map((b) => {
          const isCriticalH3 = (b.days_until_opening !== null && b.days_until_opening >= 0 && b.days_until_opening <= 3 && b.readiness_percentage < 100) ||
                               (b.days_until_opening !== null && b.days_until_opening < 0 && b.readiness_percentage < 100);
          const isUrgentH7 = b.days_until_opening !== null && b.days_until_opening > 3 && b.days_until_opening <= 7 && b.readiness_percentage < 100;
          const isPassed = b.days_until_opening !== null && b.days_until_opening < 0;

          return (
            <div
              key={`${b.region}-${b.branch_name}`}
              className={`rounded-2xl border p-4 transition-all ${
                isCriticalH3
                  ? 'border-rose-300 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 shadow-sm ring-1 ring-rose-400/50'
                  : isUrgentH7
                  ? 'border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] hover:border-[#0b57d0] dark:hover:border-[#a8c7fa]'
              }`}
            >
              {isCriticalH3 && (
                <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 mb-2 bg-rose-100/80 dark:bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-900 animate-pulse">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-rose-600" />
                    <span>KRITIS H-3: Target &le; 3 Hari!</span>
                  </span>
                  <span className="text-[10px] uppercase font-black tracking-wider">Perlu Atensi</span>
                </div>
              )}
              {isUrgentH7 && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-2">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  <span>Mendekati Target (H-{b.days_until_opening})</span>
                </div>
              )}

              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm line-clamp-1">
                    {b.branch_name}
                  </h4>
                  <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5]">
                    {b.region}
                  </span>
                </div>

                {b.days_until_opening !== null ? (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${
                      (isCriticalH3 || isUrgentH7)
                        ? 'bg-[#fce8e6] dark:bg-[#601410]/80 text-[#b3261e] dark:text-[#f2b8b5] border border-[#f9dedc] dark:border-[#601410]'
                        : isPassed
                        ? 'bg-[#f0f4f9] dark:bg-[#282a2c] text-[#5f6368] dark:text-[#c4c7c5]'
                        : 'bg-[#e8f0fe] dark:bg-[#004a77]/80 text-[#0b57d0] dark:text-[#c2e7ff] border border-[#d2e3fc] dark:border-[#004a77]'
                    }`}
                  >
                    {isPassed
                      ? 'Selesai'
                      : b.days_until_opening === 0
                      ? 'Hari Ini'
                      : `H-${b.days_until_opening} Hari`}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-[#f0f4f9] dark:bg-[#282a2c] text-[#5f6368] dark:text-[#c4c7c5]">
                    TBA
                  </span>
                )}
              </div>

              {/* Target Date */}
              <div className="flex items-center gap-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] mb-3">
                <Calendar className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>Target: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{formatDateOnly(b.target_opening_date)}</strong></span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-[#444746] dark:text-[#c4c7c5]">Kesiapan Aset:</span>
                  <span className={`font-bold ${
                    b.readiness_percentage >= 80
                      ? 'text-[#137333] dark:text-[#6dd58c]'
                      : b.readiness_percentage >= 50
                      ? 'text-[#b06000] dark:text-[#ffb951]'
                      : 'text-[#b3261e] dark:text-[#f2b8b5]'
                  }`}>
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
                    style={{ width: `${Math.min(100, Math.max(0, b.readiness_percentage))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[#444746] dark:text-[#c4c7c5] pt-0.5">
                  <span>Selesai: <strong className="text-[#137333] dark:text-[#6dd58c]">{b.items_completed}</strong></span>
                  <span>Belum: <strong className="text-[#b06000] dark:text-[#ffb951]">{b.items_pending}</strong></span>
                  <span>Total: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{b.total_items_needed}</strong> item</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
