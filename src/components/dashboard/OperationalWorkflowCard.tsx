'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  GitMerge,
  FileText,
  FileSpreadsheet,
  HelpCircle,
  Clock,
  Boxes,
  Truck,
  CheckSquare,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Layers,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { OperationalWorkflowSummary, WorkflowStageDetail } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';

interface OperationalWorkflowCardProps {
  summary: OperationalWorkflowSummary;
  region?: RegionType;
}

type StageKey =
  | 'ro'
  | 'input_excel'
  | 'pilih_proses'
  | 'kelola_pr'
  | 'ready_stock'
  | 'surat_jalan'
  | 'aset_sampai'
  | 'checklist_diterima'
  | 'update_sla'
  | 'selesai';

interface StageMeta {
  key: StageKey;
  stepNumber: number;
  label: string;
  subLabel: string;
  shape: 'pill' | 'rect' | 'diamond';
  accentColor: string;
  badgeBg: string;
  icon: React.ComponentType<{ className?: string }>;
  targetUrl: string;
  targetLabel: string;
}

const STAGES: StageMeta[] = [
  {
    key: 'ro',
    stepNumber: 1,
    label: 'Request Order',
    subLabel: 'Permohonan pengadaan masuk dari outlet',
    shape: 'pill',
    accentColor: 'border-blue-400 bg-blue-50/80 text-blue-900 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-200',
    badgeBg: 'bg-blue-600 text-white',
    icon: FileText,
    targetUrl: '/distribution/ro',
    targetLabel: 'Buka Modul Request Order',
  },
  {
    key: 'input_excel',
    stepNumber: 2,
    label: 'Input Data Excel / Sistem',
    subLabel: 'Data permohonan terekam di sistem & Google Sheets',
    shape: 'rect',
    accentColor: 'border-indigo-300 bg-indigo-50/70 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200',
    badgeBg: 'bg-indigo-600 text-white',
    icon: FileSpreadsheet,
    targetUrl: '/monitoring/input',
    targetLabel: 'Buka Input Aset Baru',
  },
  {
    key: 'pilih_proses',
    stepNumber: 3,
    label: 'Pilih Proses',
    subLabel: 'Cek ketersediaan di Warehouse / Pusat',
    shape: 'diamond',
    accentColor: 'border-amber-400 bg-amber-50/90 text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200',
    badgeBg: 'bg-amber-600 text-white',
    icon: GitMerge,
    targetUrl: '/distribution/pr',
    targetLabel: 'Lihat Alokasi Stok & PR',
  },
  {
    key: 'kelola_pr',
    stepNumber: 4,
    label: 'Kelola PR: Input Tgl Kedatangan',
    subLabel: 'Pengadaan barang baru & pantau estimasi tiba',
    shape: 'rect',
    accentColor: 'border-orange-400 bg-orange-50/80 text-orange-950 dark:border-orange-600 dark:bg-orange-950/40 dark:text-orange-200',
    badgeBg: 'bg-orange-600 text-white',
    icon: Clock,
    targetUrl: '/distribution/pr',
    targetLabel: 'Buka Modul Kelola PR',
  },
  {
    key: 'ready_stock',
    stepNumber: 5,
    label: 'Ready Stock',
    subLabel: 'Barang fisik siap di gudang pengiriman',
    shape: 'rect',
    accentColor: 'border-emerald-400 bg-emerald-50/80 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200',
    badgeBg: 'bg-emerald-600 text-white',
    icon: Boxes,
    targetUrl: '/distribution/surat-jalan',
    targetLabel: 'Buat Surat Jalan Pengiriman',
  },
  {
    key: 'surat_jalan',
    stepNumber: 6,
    label: 'Surat Jalan & Distribusi',
    subLabel: 'Dokumen SJ resmi & armada pengiriman jalan',
    shape: 'rect',
    accentColor: 'border-teal-400 bg-teal-50/80 text-teal-950 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-200',
    badgeBg: 'bg-teal-600 text-white',
    icon: Truck,
    targetUrl: '/distribution/surat-jalan',
    targetLabel: 'Buka Modul Surat Jalan',
  },
  {
    key: 'aset_sampai',
    stepNumber: 7,
    label: 'Aset Sampai di Outlet?',
    subLabel: 'Verifikasi konfirmasi kedatangan di cabang',
    shape: 'diamond',
    accentColor: 'border-amber-400 bg-amber-50/90 text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200',
    badgeBg: 'bg-amber-600 text-white',
    icon: HelpCircle,
    targetUrl: '/distribution/surat-jalan',
    targetLabel: 'Pantau Status Penerimaan',
  },
  {
    key: 'checklist_diterima',
    stepNumber: 8,
    label: 'Checklist Diterima',
    subLabel: 'Store Manager / PIC toko cek kelengkapan fisik',
    shape: 'rect',
    accentColor: 'border-cyan-400 bg-cyan-50/80 text-cyan-950 dark:border-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-200',
    badgeBg: 'bg-cyan-600 text-white',
    icon: CheckSquare,
    targetUrl: '/distribution/sla',
    targetLabel: 'Buka Checklist & Serah Terima',
  },
  {
    key: 'update_sla',
    stepNumber: 9,
    label: 'Update Sistem Pemantauan SLA',
    subLabel: 'Pencatatan lead time aktual & update durasi SLA',
    shape: 'rect',
    accentColor: 'border-purple-400 bg-purple-50/80 text-purple-950 dark:border-purple-600 dark:bg-purple-950/40 dark:text-purple-200',
    badgeBg: 'bg-purple-600 text-white',
    icon: BarChart3,
    targetUrl: '/distribution/sla',
    targetLabel: 'Buka Pemantauan SLA',
  },
  {
    key: 'selesai',
    stepNumber: 10,
    label: 'Selesai',
    subLabel: 'Aset beroperasi penuh & terdata lengkap',
    shape: 'pill',
    accentColor: 'border-emerald-500 bg-emerald-100/90 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-900/50 dark:text-emerald-100',
    badgeBg: 'bg-emerald-700 text-white',
    icon: CheckCircle2,
    targetUrl: '/monitoring/assets',
    targetLabel: 'Buka Inventaris Aset Aktif',
  },
];

export function OperationalWorkflowCard({ summary, region = 'ALL' }: OperationalWorkflowCardProps) {
  const [selectedStageKey, setSelectedStageKey] = useState<StageKey>('ro');
  const [viewMode, setViewMode] = useState<'visual' | 'matrix'>('visual');

  const selectedStageMeta = STAGES.find((s) => s.key === selectedStageKey) || STAGES[0];
  const selectedStageData = summary[selectedStageKey] as WorkflowStageDetail;

  return (
    <div className="panel-card p-5 md:p-6 transition-all shadow-sm border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1a1c1e]">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-[#e0e2ec] dark:border-[#444746] pb-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#0b57d0] to-[#1a73e8] text-white shadow-md shadow-blue-500/20">
            <GitMerge className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-base md:text-lg">
                Flow Rancangan Alur Operasional Aset
              </h3>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] border border-blue-200 dark:border-blue-800">
                <Sparkles className="h-3 w-3" /> Live Pipeline
              </span>
            </div>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-0.5">
              Pipeline pengadaan &amp; distribusi terintegrasi: dari Request Order, Kelola PR, Surat Jalan, hingga Serah Terima &amp; SLA.
            </p>
          </div>
        </div>

        {/* Action & View Mode Controls */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <div className="inline-flex rounded-lg border border-[#e0e2ec] dark:border-[#444746] p-0.5 bg-[#f8f9fa] dark:bg-[#282a2c] text-xs">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'visual'
                  ? 'bg-white dark:bg-[#1f1f1f] text-[#0b57d0] dark:text-[#a8c7fa] shadow-sm'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
              }`}
            >
              Diagram Alir
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                viewMode === 'matrix'
                  ? 'bg-white dark:bg-[#1f1f1f] text-[#0b57d0] dark:text-[#a8c7fa] shadow-sm'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f]'
              }`}
            >
              Matriks Tahapan
            </button>
          </div>

          <Link
            href="/distribution/ro"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0b57d0] hover:bg-[#0842a0] text-white transition-colors shadow-sm"
          >
            <span>Buat Order</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* VIEW MODE 1: VISUAL FLOWCHART CANVAS */}
      {viewMode === 'visual' && (
        <div className="relative mb-6">
          <div className="flex items-center justify-between text-xs text-[#747775] dark:text-[#8e918f] mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Klik pada tahapan diagram untuk melihat data antrean aktif:</span>
            </div>
            <span className="text-[11px] italic hidden md:inline">Geser horizontal jika layar sempit &rarr;</span>
          </div>

          {/* Horizontal scroll container */}
          <div className="overflow-x-auto pb-4 pt-2 -mx-2 px-2 custom-scrollbar">
            <div className="min-w-[1040px] flex flex-col gap-6 py-2">
              {/* UPPER / MAIN FLOW ROW */}
              <div className="flex items-center justify-between gap-3 relative">
                {/* 1. Request Order */}
                <NodePill
                  title="Request Order"
                  count={summary.ro.count}
                  sub="Order Masuk"
                  active={selectedStageKey === 'ro'}
                  onClick={() => setSelectedStageKey('ro')}
                  colorClasses="border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950/60 dark:text-blue-200"
                  icon={FileText}
                />

                {/* Arrow 1 -> 2 */}
                <FlowArrow label="Input" />

                {/* 2. Input Data Excel / Sistem */}
                <NodeRect
                  title="Input Data Excel / Sistem"
                  count={summary.input_excel.count}
                  sub="Record Sistem"
                  active={selectedStageKey === 'input_excel'}
                  onClick={() => setSelectedStageKey('input_excel')}
                  colorClasses="border-indigo-300 bg-indigo-50/70 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-200"
                  icon={FileSpreadsheet}
                />

                {/* Arrow 2 -> 3 */}
                <FlowArrow label="Verifikasi" />

                {/* 3. Pilih Proses (Diamond) */}
                <NodeDiamond
                  title="Pilih Proses"
                  badgeText="Stok?"
                  active={selectedStageKey === 'pilih_proses'}
                  onClick={() => setSelectedStageKey('pilih_proses')}
                  colorClasses="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/70 dark:text-amber-200"
                  icon={GitMerge}
                />

                {/* Arrow 3 -> Ready Stock (Upper Branch) */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 -mb-1 z-10">
                    Ready Stock ({summary.pilih_proses.readyCount})
                  </span>
                  <FlowArrow />
                </div>

                {/* 5. Ready Stock */}
                <NodeRect
                  title="Ready Stock"
                  count={summary.ready_stock.count}
                  sub="Gudang Kirim"
                  active={selectedStageKey === 'ready_stock'}
                  onClick={() => setSelectedStageKey('ready_stock')}
                  colorClasses="border-emerald-400 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-200"
                  icon={Boxes}
                />

                {/* Arrow Ready Stock -> Surat Jalan */}
                <FlowArrow label="Terbit SJ" />

                {/* 6. Surat Jalan & Distribusi */}
                <div className="relative">
                  <NodeRect
                    title="Surat Jalan & Distribusi"
                    count={summary.surat_jalan.count}
                    sub="Armada Jalan"
                    active={selectedStageKey === 'surat_jalan'}
                    onClick={() => setSelectedStageKey('surat_jalan')}
                    colorClasses="border-teal-400 bg-teal-50 text-teal-950 dark:border-teal-600 dark:bg-teal-950/60 dark:text-teal-200"
                    icon={Truck}
                  />
                  {/* Loopback Return Indicator Badge */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-amber-100 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-[9px] font-semibold px-2 py-0.5 rounded-full shadow-xs">
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Loop Belum Tiba</span>
                  </div>
                </div>

                {/* Arrow Surat Jalan -> Aset Sampai */}
                <FlowArrow />

                {/* 7. Aset Sampai? (Diamond) */}
                <NodeDiamond
                  title="Aset Sampai?"
                  badgeText="Outlet"
                  active={selectedStageKey === 'aset_sampai'}
                  onClick={() => setSelectedStageKey('aset_sampai')}
                  colorClasses="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/70 dark:text-amber-200"
                  icon={HelpCircle}
                />

                {/* Arrow Aset Sampai -> Checklist Diterima (Branch Ya) */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 -mb-1 z-10">
                    Ya ({summary.aset_sampai.arrivedCount})
                  </span>
                  <FlowArrow />
                </div>

                {/* 8. Checklist Diterima */}
                <NodeRect
                  title="Checklist Diterima"
                  count={summary.checklist_diterima.count}
                  sub="Cek Fisik Toko"
                  active={selectedStageKey === 'checklist_diterima'}
                  onClick={() => setSelectedStageKey('checklist_diterima')}
                  colorClasses="border-cyan-400 bg-cyan-50 text-cyan-950 dark:border-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-200"
                  icon={CheckSquare}
                />

                {/* Arrow Checklist -> Update SLA */}
                <FlowArrow label="Validasi" />

                {/* 9. Update Sistem Pemantauan SLA */}
                <NodeRect
                  title="Update SLA Sistem"
                  count={summary.update_sla.count}
                  sub="Performa SLA"
                  active={selectedStageKey === 'update_sla'}
                  onClick={() => setSelectedStageKey('update_sla')}
                  colorClasses="border-purple-400 bg-purple-50 text-purple-950 dark:border-purple-600 dark:bg-purple-950/60 dark:text-purple-200"
                  icon={BarChart3}
                />

                {/* Arrow SLA -> Selesai */}
                <FlowArrow label="Done" />

                {/* 10. Selesai */}
                <NodePill
                  title="Selesai"
                  count={summary.selesai.count}
                  sub="Operasional"
                  active={selectedStageKey === 'selesai'}
                  onClick={() => setSelectedStageKey('selesai')}
                  colorClasses="border-emerald-500 bg-emerald-100 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-900/60 dark:text-emerald-100"
                  icon={CheckCircle2}
                />
              </div>

              {/* LOWER BRANCH ROW: Belum Tersedia -> Kelola PR -> Aset Tiba -> Ready Stock */}
              <div className="relative pl-[220px] pr-[400px]">
                {/* Visual Branch Line connector */}
                <div className="flex items-center gap-4 bg-[#f8f9fa] dark:bg-[#202225] border border-dashed border-[#c4c7c5] dark:border-[#444746] rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700">
                      Jalur Belum Tersedia ({summary.pilih_proses.prCount})
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  {/* 4. Kelola PR Box */}
                  <div
                    onClick={() => setSelectedStageKey('kelola_pr')}
                    className={`cursor-pointer transition-all flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                      selectedStageKey === 'kelola_pr'
                        ? 'border-orange-500 ring-2 ring-orange-400 shadow-md bg-orange-100 dark:bg-orange-950'
                        : 'border-orange-300 bg-orange-50 hover:border-orange-400 dark:border-orange-700 dark:bg-orange-950/40'
                    }`}
                  >
                    <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <div>
                      <div className="font-bold text-xs text-orange-950 dark:text-orange-100">
                        Kelola PR: Input Tgl Kedatangan
                      </div>
                      <div className="text-[10px] text-orange-700 dark:text-orange-300">
                        Pengadaan Baru &bull; {summary.kelola_pr.count} Item Aktif
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <ArrowRight className="h-4 w-4" />
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700">
                      Aset Tiba &rarr; Masuk Ready Stock
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: MATRIX GRID VIEW */}
      {viewMode === 'matrix' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          {STAGES.map((s) => {
            const isSelected = selectedStageKey === s.key;
            const data = summary[s.key] as WorkflowStageDetail;
            const Icon = s.icon;

            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelectedStageKey(s.key)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-[#0b57d0] ring-2 ring-[#0b57d0]/20 dark:ring-[#a8c7fa]/20 bg-[#f0f4f9] dark:bg-[#282a2c] shadow-sm'
                    : 'border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] hover:border-[#747775]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-[10px] font-bold text-[#747775] dark:text-[#8e918f]">
                    Tahap {s.stepNumber}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${s.badgeBg}`}
                  >
                    {data.count}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa] shrink-0" />
                  <span className="font-semibold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] line-clamp-1">
                    {s.label}
                  </span>
                </div>
                <p className="text-[10px] text-[#444746] dark:text-[#c4c7c5] line-clamp-2 mt-auto">
                  {s.subLabel}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* SELECTED STAGE DETAIL INSPECTOR PANEL */}
      <div className="rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8f9fa] dark:bg-[#202225] p-4 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#e0e2ec] dark:border-[#35383a] pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${selectedStageMeta.badgeBg}`}>
              <selectedStageMeta.icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#747775] dark:text-[#8e918f]">
                  Tahap {selectedStageMeta.stepNumber}
                </span>
                <h4 className="font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                  {selectedStageMeta.label}
                </h4>
                <span className="rounded-full bg-white dark:bg-[#1a1c1e] px-2 py-0.5 text-xs font-bold border border-[#e0e2ec] dark:border-[#444746] text-[#1f1f1f] dark:text-[#e3e3e3]">
                  {selectedStageData.count} Item Aktif
                </span>
              </div>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
                {selectedStageMeta.subLabel}
              </p>
            </div>
          </div>

          <Link
            href={selectedStageMeta.targetUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#0b57d0] dark:border-[#a8c7fa] text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#0b57d0]/10 transition-colors self-start md:self-auto"
          >
            <span>{selectedStageMeta.targetLabel}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mini Item Records in Stage */}
        {selectedStageData.items && selectedStageData.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {selectedStageData.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1a1c1e] p-3 shadow-xs hover:border-[#0b57d0] transition-colors"
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <span className="font-semibold text-xs text-[#1f1f1f] dark:text-[#e3e3e3] line-clamp-1">
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#e8f0fe] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff] shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p
                  className="text-[11px] text-[#444746] dark:text-[#c4c7c5] line-clamp-1 mb-2"
                  dangerouslySetInnerHTML={{ __html: item.subtitle }}
                />
                <div className="flex items-center justify-between text-[10px] text-[#747775] dark:text-[#8e918f] border-t border-[#f0f4f9] dark:border-[#282a2c] pt-1.5">
                  <span className="font-medium">{item.status}</span>
                  <span>{item.info}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-[#747775] dark:text-[#8e918f]">
            Tidak ada permohonan yang tertahan di tahap ini untuk wilayah{' '}
            <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{region}</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Helper Sub-Components for Flow Nodes & Arrows
// ---------------------------------------------------------

interface NodePillProps {
  title: string;
  count: number;
  sub: string;
  active: boolean;
  onClick: () => void;
  colorClasses: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NodePill({ title, count, sub, active, onClick, colorClasses, icon: Icon }: NodePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-full border-2 transition-all shrink-0 cursor-pointer ${colorClasses} ${
        active ? 'ring-3 ring-blue-500 shadow-md scale-105' : 'hover:scale-102 hover:shadow-sm'
      }`}
    >
      <div className="p-1 rounded-full bg-white/70 dark:bg-black/30">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-left">
        <div className="font-bold text-xs tracking-tight">{title}</div>
        <div className="text-[10px] opacity-80">{sub}</div>
      </div>
      <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
        {count}
      </span>
    </button>
  );
}

interface NodeRectProps {
  title: string;
  count: number;
  sub: string;
  active: boolean;
  onClick: () => void;
  colorClasses: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NodeRect({ title, count, sub, active, onClick, colorClasses, icon: Icon }: NodeRectProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-start min-w-[120px] max-w-[145px] p-2.5 rounded-xl border-2 transition-all shrink-0 cursor-pointer text-left ${colorClasses} ${
        active ? 'ring-3 ring-blue-500 shadow-md scale-105' : 'hover:scale-102 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-1">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900 text-[9px] font-bold">
          {count}
        </span>
      </div>
      <div className="font-bold text-xs leading-tight line-clamp-2">{title}</div>
      <div className="text-[9px] opacity-75 mt-0.5">{sub}</div>
    </button>
  );
}

interface NodeDiamondProps {
  title: string;
  badgeText: string;
  active: boolean;
  onClick: () => void;
  colorClasses: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NodeDiamond({ title, badgeText, active, onClick, colorClasses, icon: Icon }: NodeDiamondProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center w-[90px] h-[75px] rounded-lg border-2 transition-all shrink-0 cursor-pointer text-center ${colorClasses} ${
        active ? 'ring-3 ring-amber-500 shadow-md scale-105' : 'hover:scale-102 hover:shadow-sm'
      }`}
    >
      <Icon className="h-3.5 w-3.5 mb-0.5 text-amber-600 dark:text-amber-400" />
      <div className="font-bold text-[11px] leading-tight px-1">{title}</div>
      <span className="mt-0.5 text-[8px] font-semibold uppercase px-1 rounded bg-amber-200/70 dark:bg-amber-800/70 text-amber-900 dark:text-amber-100">
        {badgeText}
      </span>
    </button>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 shrink-0 text-[#747775] dark:text-[#8e918f]">
      {label && <span className="text-[9px] font-semibold mb-0.5 text-[#444746] dark:text-[#c4c7c5]">{label}</span>}
      <div className="flex items-center">
        <div className="w-4 sm:w-6 h-0.5 bg-[#c4c7c5] dark:bg-[#444746]" />
        <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-[#747775] dark:border-l-[#8e918f]" />
      </div>
    </div>
  );
}
