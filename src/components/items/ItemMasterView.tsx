'use client';

import React, { useState, useDeferredValue, useMemo, useEffect } from 'react';
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
  Store,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { MasterAssetItem } from '@/lib/supabase/server';
import { TableSkeleton, CardGridSkeleton } from '@/components/ui/Skeleton';

interface ItemMasterViewProps {
  initialItems: MasterAssetItem[];
}

export default function ItemMasterView({ initialItems }: ItemMasterViewProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'new' ? 'new' : 'master';

  const [activeTab, setActiveTab] = useState<'master' | 'new'>(initialTab);
  const [items, setItems] = useState<MasterAssetItem[]>(initialItems);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const isSearching = search !== deferredSearch;

  const [classificationFilter, setClassificationFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, classificationFilter, activeTab, pageSize]);

  // Classifications matching Google Sheet
  const classifications = [
    'ALL',
    'Perlengkapan Tetap',
    'Peralatan',
    'Mesin',
    'Kendaraan',
    'Bangunan',
    'Perlengkapan Habis Pakai',
  ];

  const handleSyncSheet = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback('Menyinkronkan dari Google Spreadsheet Master Aset...');
      const res = await fetch('/api/items/sync-sheet', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncFeedback(json.message);
        const getRes = await fetch('/api/items/sync-sheet');
        const getData = await getRes.json();
        if (getData.data) setItems(getData.data);
      } else {
        setSyncFeedback(`Gagal: ${json.message}`);
      }
    } catch (err: any) {
      setSyncFeedback(`Terjadi kesalahan: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return items.filter((it) => {
      // Tab filter: 'new' shows new items, 'master' shows all
      if (activeTab === 'new' && !it.is_new_item) return false;

      // Classification filter
      if (classificationFilter !== 'ALL' && it.classification !== classificationFilter) return false;

      if (!q) return true;

      // Search query
      const name = (it.item_name || '').toLowerCase();
      const sysName = (it.system_item_name || '').toLowerCase();
      const spec = (it.specification || '').toLowerCase();
      return name.includes(q) || sysName.includes(q) || spec.includes(q);
    });
  }, [items, activeTab, classificationFilter, deferredSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const newItemCount = useMemo(() => items.filter((it) => it.is_new_item).length, [items]);

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
            className={`interactive-tap px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'master'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Master Aset (Gambar &amp; Spek)
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`interactive-tap flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
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
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isSearching ? 'text-amber-500 animate-spin' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Cari nama barang, spek teknis, klasifikasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Sync Official Google Sheet */}
            <button
              onClick={handleSyncSheet}
              disabled={isSyncing}
              className="interactive-tap flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-3.5 py-2 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/60 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Tarik Spreadsheet Master Aset'}</span>
            </button>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`interactive-tap p-1.5 rounded-md transition ${
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
                className={`interactive-tap p-1.5 rounded-md transition ${
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
              className="interactive-tap flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Aset Baru</span>
            </Link>
          </div>
        </div>

        {/* Sync Feedback Alert */}
        {syncFeedback && (
          <div className="p-2.5 px-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {syncFeedback}
            </span>
            <button onClick={() => setSyncFeedback(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold">✕</button>
          </div>
        )}

        {/* Classification Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Klasifikasi:
          </span>
          {classifications.map((cls) => (
            <button
              key={cls}
              onClick={() => setClassificationFilter(cls)}
              className={`interactive-tap px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
                classificationFilter === cls
                  ? 'bg-amber-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {cls === 'ALL' ? `Semua (${items.length})` : cls}
            </button>
          ))}
        </div>
      </div>

      {/* Content Rendering: Grid vs Table */}
      {isSyncing ? (
        viewMode === 'grid' ? (
          <CardGridSkeleton count={8} />
        ) : (
          <TableSkeleton columns={5} rows={8} />
        )
      ) : viewMode === 'grid' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {paginatedItems.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                Tidak ada item aset yang sesuai dengan filter.
              </div>
            ) : (
              paginatedItems.map((item) => (
                <div
                  key={item.id}
                  className="card-lift group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    {/* Image Header */}
                    <div className="relative h-44 bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 overflow-hidden">
                      {item.photo_url ? (
                        <img
                          src={item.photo_url}
                          alt={item.item_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
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

                      {item.unit && (
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-800/80 text-white shadow-xs">
                          {item.unit}
                        </span>
                      )}
                    </div>

                    {/* Body Content */}
                    <div className="p-4 space-y-2.5">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {item.item_name}
                      </h3>

                      {item.specification && (
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3">
                          <strong>Spesifikasi:</strong> {item.specification}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-3 px-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono">{item.unit || 'unit'}</span>
                    <span>{item.is_new_item ? 'Item Baru' : 'Standar CA'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold uppercase text-[11px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Nama Item Aset</th>
                  <th className="py-3.5 px-4">Satuan</th>
                  <th className="py-3.5 px-4">Klasifikasi / Akun</th>
                  <th className="py-3.5 px-4">Spesifikasi Teknis</th>
                  <th className="py-3.5 px-4">Status Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Tidak ada data item yang cocok.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((it) => (
                    <tr key={it.id} className="row-interactive transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {it.unit || 'unit'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50">
                          {it.classification}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm text-xs text-slate-600 dark:text-slate-400">
                        {it.specification ? (
                          it.specification.startsWith('http') ? (
                            <a href={it.specification} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                              Link Spesifikasi ↗
                            </a>
                          ) : (
                            <span className="line-clamp-2">{it.specification}</span>
                          )
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <span>
              Menampilkan{' '}
              <strong className="text-slate-900 dark:text-white">
                {(currentPage - 1) * pageSize + 1}
              </strong>{' '}
              -{' '}
              <strong className="text-slate-900 dark:text-white">
                {Math.min(currentPage * pageSize, filteredItems.length)}
              </strong>{' '}
              dari{' '}
              <strong className="text-slate-900 dark:text-white">
                {filteredItems.length}
              </strong>{' '}
              item
            </span>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <label className="flex items-center gap-1.5">
              <span>Per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-amber-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="interactive-tap p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Halaman Pertama"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="interactive-tap p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Halaman Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Hal {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="interactive-tap p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Halaman Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="interactive-tap p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Halaman Terakhir"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
