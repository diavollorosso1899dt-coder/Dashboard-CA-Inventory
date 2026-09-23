'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Package, 
  FileCheck2, 
  Truck, 
  Store, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle 
} from 'lucide-react';

interface ExecutiveKpiCardsProps {
  totalAssets: number;
  totalEstimatedValue?: number;
  roStats: {
    total: number;
    readyStock: number;
    needPr: number;
    inDelivery: number;
    cancelled: number;
  };
  sjStats: {
    total: number;
    inDelivery: number;
    delivered: number;
  };
  upcomingBranchesCount: number;
  avgReadiness: number;
}

export function ExecutiveKpiCards({
  totalAssets,
  totalEstimatedValue = 0,
  roStats,
  sjStats,
  upcomingBranchesCount,
  avgReadiness,
}: ExecutiveKpiCardsProps) {
  const formatNumber = (n: number) => n.toLocaleString('id-ID');
  const formatRupiah = (val: number) => {
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)} Miliar`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)} Juta`;
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Permohonan Aset */}
      <Link
        href="/monitoring/assets"
        className="group panel-card p-4.5 hover:border-[#0b57d0] dark:hover:border-[#a8c7fa] transition-all hover:shadow-md block relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-[#0b57d0] dark:text-[#a8c7fa]">
            <Package className="h-5 w-5" />
          </div>
          <span className="flex items-center text-[11px] font-semibold text-[#0b57d0] dark:text-[#a8c7fa] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            Buka Pelacak <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
          </span>
        </div>
        <div className="text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
          {formatNumber(totalAssets)} <span className="text-xs font-medium text-[#747775]">Baris</span>
        </div>
        <div className="text-xs font-semibold text-[#1f1f1f] dark:text-[#c4c7c5] mt-1">
          Permohonan Aset Terdata
        </div>
        <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a] truncate">
          {totalEstimatedValue > 0 ? `Est. Nilai: ${formatRupiah(totalEstimatedValue)}` : 'Tersinkronisasi Realtime'}
        </div>
      </Link>

      {/* 2. Dokumen Request Order (RO) */}
      <Link
        href="/distribution/ro"
        className="group panel-card p-4.5 hover:border-indigo-500 dark:hover:border-indigo-400 transition-all hover:shadow-md block relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <span className="flex items-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            Kelola RO <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
          </span>
        </div>
        <div className="text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
          {formatNumber(roStats.total)} <span className="text-xs font-medium text-[#747775]">Dokumen</span>
        </div>
        <div className="text-xs font-semibold text-[#1f1f1f] dark:text-[#c4c7c5] mt-1">
          Alur Request Order (RO)
        </div>
        <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a] flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{roStats.readyStock} Ready</span>
          <span>&bull;</span>
          <span className="text-orange-600 dark:text-orange-400 font-semibold">{roStats.needPr} Butuh PR</span>
        </div>
      </Link>

      {/* 3. Surat Jalan Pengiriman */}
      <Link
        href="/distribution/surat-jalan"
        className="group panel-card p-4.5 hover:border-teal-500 dark:hover:border-teal-400 transition-all hover:shadow-md block relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Truck className="h-5 w-5" />
          </div>
          <span className="flex items-center text-[11px] font-semibold text-teal-600 dark:text-teal-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            Surat Jalan <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
          </span>
        </div>
        <div className="text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
          {formatNumber(sjStats.total)} <span className="text-xs font-medium text-[#747775]">Terbit</span>
        </div>
        <div className="text-xs font-semibold text-[#1f1f1f] dark:text-[#c4c7c5] mt-1">
          Distribusi &amp; Ekspedisi
        </div>
        <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a] flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 font-semibold">{sjStats.inDelivery} Sedang Dikirim</span>
          <span>&bull;</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{sjStats.delivered} Sampai</span>
        </div>
      </Link>

      {/* 4. Kesiapan Outlet Baru */}
      <Link
        href="/opening-readiness"
        className="group panel-card p-4.5 hover:border-amber-500 dark:hover:border-amber-400 transition-all hover:shadow-md block relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Store className="h-5 w-5" />
          </div>
          <span className="flex items-center text-[11px] font-semibold text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform">
            Kesiapan <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
          </span>
        </div>
        <div className="text-2xl font-black text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
          {upcomingBranchesCount} <span className="text-xs font-medium text-[#747775]">Cabang</span>
        </div>
        <div className="text-xs font-semibold text-[#1f1f1f] dark:text-[#c4c7c5] mt-1">
          Opening Segera (&le; 30 Hari)
        </div>
        <div className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1.5 pt-2 border-t border-[#e0e2ec] dark:border-[#35383a] flex items-center gap-1.5">
          <span>Rata-rata kesiapan:</span>
          <strong className="text-amber-700 dark:text-amber-400 font-bold">{avgReadiness}%</strong>
        </div>
      </Link>
    </div>
  );
}
