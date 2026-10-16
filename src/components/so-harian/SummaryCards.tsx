'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, MinusCircle, AlertTriangle, Package, Award, Wrench, Armchair } from 'lucide-react';
import { calculateSessionSummary, SOItem } from '@/lib/so-harian/inventoryEngine';

interface SummaryCardsProps {
  items: SOItem[];
}

export default function SummaryCards({ items = [] }: SummaryCardsProps) {
  const summary = useMemo(() => calculateSessionSummary(items), [items]);
  const catSummary = summary.byCategory || {
    Peralatan: { total: 0, match: 0, checked: 0, akurasi: 0 },
    'Perlengkapan Tetap': { total: 0, match: 0, checked: 0, akurasi: 0 },
  };

  return (
    <div className="space-y-3">
      {/* 1. Main Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total SKU */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-xl">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total SKU</span>
            <span className="text-xl font-black text-slate-800 dark:text-white">{summary.totalItem}</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 block">{summary.itemChecked} terhitung</span>
          </div>
        </div>

        {/* Match (Cocok) */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Match (Cocok)</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{summary.itemMatch}</span>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block">Stok Sesuai</span>
          </div>
        </div>

        {/* Selisih Minus */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl">
            <MinusCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Selisih Minus</span>
            <span className="text-xl font-black text-rose-600 dark:text-rose-400">{summary.itemMinus}</span>
            <span className="text-[10px] text-rose-500 block">Kurang Fisik</span>
          </div>
        </div>

        {/* Selisih Plus */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Selisih Plus</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">{summary.itemPlus}</span>
            <span className="text-[10px] text-amber-600 block">Lebih Fisik</span>
          </div>
        </div>

        {/* Total Akurasi */}
        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-2xl shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-white/10 text-amber-400 rounded-xl">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">Akurasi Global</span>
            <div className="flex items-baseline space-x-1">
              <span className="text-xl font-black">{summary.akurasiPersen}%</span>
            </div>
            <span className="text-[10px] text-slate-300 block">
              {summary.akurasiPersen >= 98 ? '🌟 Sangat Baik' : summary.akurasiPersen >= 90 ? '👍 Baik' : '⚠️ Perlu Audit'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Category Accuracy Breakdown Pills */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Peralatan */}
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-black text-amber-950 dark:text-amber-200 block">Akurasi Kategori Peralatan</span>
              <span className="text-[11px] text-amber-800 dark:text-amber-300/80">
                {catSummary.Peralatan.match} Cocok dari {catSummary.Peralatan.total} SKU ({catSummary.Peralatan.checked} terhitung)
              </span>
            </div>
          </div>
          <span className="text-sm font-black text-amber-900 dark:text-amber-200 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800/60 shadow-xs">
            {catSummary.Peralatan.akurasi}%
          </span>
        </div>

        {/* Perlengkapan Tetap */}
        <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/40 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg">
              <Armchair className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-black text-indigo-950 dark:text-indigo-200 block">Akurasi Kategori Perlengkapan Tetap</span>
              <span className="text-[11px] text-indigo-800 dark:text-indigo-300/80">
                {catSummary['Perlengkapan Tetap'].match} Cocok dari {catSummary['Perlengkapan Tetap'].total} SKU ({catSummary['Perlengkapan Tetap'].checked} terhitung)
              </span>
            </div>
          </div>
          <span className="text-sm font-black text-indigo-900 dark:text-indigo-200 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/60 shadow-xs">
            {catSummary['Perlengkapan Tetap'].akurasi}%
          </span>
        </div>
      </div>
    </div>
  );
}
