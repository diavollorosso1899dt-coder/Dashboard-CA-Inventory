'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Boxes, 
  Search, 
  Sparkles, 
  Image as ImageIcon, 
  Layers, 
  DollarSign, 
  Tag, 
  PlusCircle, 
  Filter, 
  Grid, 
  List, 
  Zap, 
  Ruler, 
  CheckCircle2, 
  Store
} from 'lucide-react';
import { MasterAssetItem } from '@/lib/supabase/server';

interface ItemMasterViewProps {
  initialItems: MasterAssetItem[];
}

export default function ItemMasterView({ initialItems }: ItemMasterViewProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'new' ? 'new' : 'master';

  const [activeTab, setActiveTab] = useState<'master' | 'new'>(initialTab);
  const [items, setItems] = useState<MasterAssetItem[]>(initialItems);
  const [search, setSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Classifications
  const classifications = [
    'ALL',
    'AST-Kitchen',
    'AST-Furniture',
    'AST-Electronic',
    'PLK Service',
    'IT & POS',
    'General',
  ];

  const filteredItems = items.filter((it) => {
    // Tab filter: 'new' shows new items, 'master' shows all
    if (activeTab === 'new' && !it.is_new_item) return false;

    // Classification filter
    if (classificationFilter !== 'ALL' && it.classification !== classificationFilter) return false;

    // Search query
    const q = search.toLowerCase();
    const name = it.item_name.toLowerCase();
    const sysName = it.system_item_name.toLowerCase();
    const spec = (it.specification || '').toLowerCase();
    return name.includes(q) || sysName.includes(q) || spec.includes(q);
  });

  const newItemCount = items.filter((it) => it.is_new_item).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Kelola Item &amp; Master Aset
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Katalog referensi barang standar Coffee Arabica (CA), spesifikasi teknis, gambar, dan daftar item baru.
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'master'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Master Aset (Gambar &amp; Spek)
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'new'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <span>Daftar Item Baru</span>
            {newItemCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold">
                {newItemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Toolbar & Classification Filters */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama barang, spek teknis, klasifikasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Tampilan Galeri Kartu"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Tampilan Tabel"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <Link
              href="/monitoring/input"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Aset Baru</span>
            </Link>
          </div>
        </div>

        {/* Classification Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Klasifikasi:
          </span>
          {classifications.map((cls) => (
            <button
              key={cls}
              onClick={() => setClassificationFilter(cls)}
              className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                classificationFilter === cls
                  ? 'bg-amber-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {cls === 'ALL' ? 'Semua Klasifikasi' : cls}
            </button>
          ))}
        </div>
      </div>

      {/* Content Rendering: Grid vs Table */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredItems.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-400">
              Tidak ada item aset yang sesuai dengan filter.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Image Header */}
                  <div className="relative h-44 bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-b border-slate-100 dark:border-slate-800">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt={item.item_name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // fallback if broken link
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-slate-400">
                        <ImageIcon className="w-10 h-10 opacity-50" />
                        <span className="text-[11px]">Gambar Standar Aset</span>
                      </div>
                    )}

                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 shadow-xs border border-slate-200/60 dark:border-slate-700">
                      {item.classification}
                    </span>

                    {item.is_new_item && (
                      <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                        Item Baru
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-2.5 text-xs">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2">
                        {item.item_name}
                      </h3>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">
                        {item.system_item_name}
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5 text-[11px]">
                      <div className="text-slate-600 dark:text-slate-400 line-clamp-2">
                        <strong>Spesifikasi:</strong> {item.specification || 'Spesifikasi dimensi belum dilengkapi'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-500 text-[11px]">Estimasi RAB:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Rp {item.standard_rab_price.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-3 px-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Permohonan: <strong>{item.total_requests}x</strong></span>
                  <span>Total Unit: <strong>{item.total_units_needed}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold uppercase text-[11px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Nama Item Aset</th>
                  <th className="py-3.5 px-4">Klasifikasi</th>
                  <th className="py-3.5 px-4">Spesifikasi Teknis</th>
                  <th className="py-3.5 px-4">Estimasi RAB Satuan</th>
                  <th className="py-3.5 px-4">Total Permintaan</th>
                  <th className="py-3.5 px-4">Status Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredItems.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{it.system_item_name}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-medium">
                        {it.classification}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs text-[11px] text-slate-600 dark:text-slate-400">
                      {it.specification || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      Rp {it.standard_rab_price.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold">
                      {it.total_units_needed} Unit ({it.total_requests} order)
                    </td>
                    <td className="py-3.5 px-4">
                      {it.is_new_item ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 text-[11px] font-bold">
                          Item Baru
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 text-[11px] font-semibold">
                          Standar CA
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
