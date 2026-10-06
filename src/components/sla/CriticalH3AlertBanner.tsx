'use client';

import React from 'react';
import { AlertTriangle, Clock, ArrowRight, ShieldAlert, Sparkles, ChevronRight } from 'lucide-react';

export interface CriticalEntity {
  name: string;
  region: string;
  daysRemaining: number | null;
  readinessPct?: number;
  unfulfilledCount?: number;
  type: 'BRANCH' | 'RO';
  id?: string;
}

interface CriticalH3AlertBannerProps {
  criticalEntities: CriticalEntity[];
  onSelectEntity: (name: string, type: 'BRANCH' | 'RO', id?: string) => void;
  onFilterCriticalTab: () => void;
}

export default function CriticalH3AlertBanner({
  criticalEntities = [],
  onSelectEntity,
  onFilterCriticalTab,
}: CriticalH3AlertBannerProps) {
  if (criticalEntities.length === 0) return null;

  // Deduplicate branches if multiple entities share branch name
  const branchMap = new Map<string, CriticalEntity>();
  for (const ent of criticalEntities) {
    if (!branchMap.has(ent.name)) {
      branchMap.set(ent.name, ent);
    }
  }
  const displayEntities = Array.from(branchMap.values()).slice(0, 8);

  return (
    <div className="p-4 rounded-2xl border-2 border-rose-400 dark:border-rose-800 bg-rose-50/90 dark:bg-rose-950/40 shadow-sm animate-fade-in relative overflow-hidden">
      {/* Decorative gradient glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-rose-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs shrink-0 animate-pulse">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white tracking-wider animate-pulse">
                PERINGATAN SLA KRITIS (H-3)
              </span>
              <h2 className="text-sm md:text-base font-bold text-rose-950 dark:text-rose-100">
                {criticalEntities.length} Target Order / Cabang Mendekati Deadline &le; 3 Hari!
              </h2>
            </div>
            <p className="text-xs text-rose-900/80 dark:text-rose-200 mt-1 max-w-2xl">
              Target pemenuhan permintaan atau jadwal pembukaan outlet sudah sangat dekat (&le; 3 hari), namun item aset belum 100% lengkap. Segera lakukan percepatan alokasi stok gudang SCGA atau kontak vendor PR.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={onFilterCriticalTab}
            className="interactive-tap inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs"
          >
            <span>Fokus Kritis H-3</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Critical Entity Chips */}
      <div className="mt-3 pt-3 border-t border-rose-200/80 dark:border-rose-900/60 flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 uppercase shrink-0">
          Cabang Terdampak:
        </span>
        <div className="flex items-center gap-2 flex-nowrap">
          {displayEntities.map((ent, idx) => (
            <button
              key={`${ent.name}-${idx}`}
              type="button"
              onClick={() => onSelectEntity(ent.name, ent.type, ent.id)}
              className="interactive-tap shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-[#1a1c1e] border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-900 dark:text-rose-200 hover:bg-rose-100/60 transition shadow-2xs"
              title={`Klik untuk memfilter data khusus ${ent.name}`}
            >
              <span className="max-w-[140px] truncate">{ent.name}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">
                {ent.daysRemaining !== null 
                  ? (ent.daysRemaining < 0 ? `+${Math.abs(ent.daysRemaining)}h` : ent.daysRemaining === 0 ? 'Hari Ini' : `H-${ent.daysRemaining}`)
                  : 'H-3'}
              </span>
              {typeof ent.readinessPct === 'number' && (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  {ent.readinessPct}%
                </span>
              )}
            </button>
          ))}
          {criticalEntities.length > displayEntities.length && (
            <button
              type="button"
              onClick={onFilterCriticalTab}
              className="text-xs font-bold text-rose-700 dark:text-rose-300 hover:underline shrink-0 px-2"
            >
              +{criticalEntities.length - displayEntities.length} lainnya &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
