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
  ChevronsRight,
  X,
  ZoomIn,
  Upload,
  FileEdit
} from 'lucide-react';
import { MasterAssetItem } from '@/lib/supabase/server';
import { TableSkeleton, CardGridSkeleton } from '@/components/ui/Skeleton';
import { getItemImageUrl, setItemImageOverride } from '@/lib/assetImageHelper';
import UploadImageModal from './UploadImageModal';
import EditSpecModal from './EditSpecModal';
import ColumnVisibilityPicker, { ColumnItem, useColumnVisibility } from '@/components/ui/ColumnVisibilityPicker';
import AreaFilterPills from '@/components/ui/AreaFilterPills';

const ITEM_MASTER_COLUMNS: ColumnItem[] = [
  { id: 'image', label: 'Gambar', defaultVisible: true },
  { id: 'item_name', label: 'Nama Item Aset', defaultVisible: true, alwaysVisible: true },
  { id: 'unit', label: 'Satuan', defaultVisible: true },
  { id: 'classification', label: 'Klasifikasi / Akun', defaultVisible: true },
  { id: 'specification', label: 'Spesifikasi Teknis', defaultVisible: true },
  { id: 'status', label: 'Status Item', defaultVisible: true },
  { id: 'actions', label: 'Aksi', defaultVisible: true, alwaysVisible: true },
];

interface ItemMasterViewProps {
  initialItems: MasterAssetItem[];
}

function getPrimaryPhotoUrl(url: string | null | undefined, itemName?: string): string | null {
  if (url) {
    if (url.startsWith('[')) {
      try {
        const parsed = JSON.parse(url);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      } catch {}
    }
    return url;
  }
  if (itemName) {
    return getItemImageUrl(itemName);
  }
  return null;
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
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadModalTarget, setUploadModalTarget] = useState<{ itemName: string; currentImageUrl?: string | null } | null>(null);
  const [editingSpecItem, setEditingSpecItem] = useState<MasterAssetItem | null>(null);

  // Column Visibility
  const { visibleColumns, setVisibleColumns, isVisible } = useColumnVisibility(
    'ca_item_master_columns',
    ITEM_MASTER_COLUMNS
  );
  const visibleColCount = ITEM_MASTER_COLUMNS.filter((c) => isVisible(c.id)).length;

  const handleUploadSuccess = (updatedItemName: string, newImageUrl: string) => {
    setItemImageOverride(updatedItemName, newImageUrl);
    setItems((prev) =>
      prev.map((it) =>
        it.item_name.toLowerCase() === updatedItemName.toLowerCase()
          ? { ...it, photo_url: newImageUrl }
          : it
      )
    );
    setSyncFeedback(`Foto "${updatedItemName}" berhasil dikompresi & disimpan ke Supabase!`);
  };

  const handleSpecSuccess = (updatedItemName: string, newSpec: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.item_name.toLowerCase() === updatedItemName.toLowerCase()
          ? { ...it, specification: newSpec }
          : it
      )
    );
    setSyncFeedback(`Spesifikasi "${updatedItemName}" berhasil disimpan ke Supabase!`);
  };

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
              Katalog referensi barang standar HANTARAN, spesifikasi teknis, gambar, dan daftar item baru.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <AreaFilterPills syncUrl={true} />

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
            {/* Upload Custom Image to Supabase */}
            <button
              onClick={() => setUploadModalTarget({ itemName: '' })}
              className="interactive-tap flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-3.5 py-2 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition shadow-xs"
              title="Upload & kompresi foto aset ke Supabase (maks 100 KB)"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Foto (&le; 100KB)</span>
            </button>

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

            {viewMode === 'table' && (
              <ColumnVisibilityPicker
                columns={ITEM_MASTER_COLUMNS}
                visibleColumns={visibleColumns}
                onChange={setVisibleColumns}
                storageKey="ca_item_master_columns"
              />
            )}

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
                    {(() => {
                      const photoUrl = getPrimaryPhotoUrl(item.photo_url, item.item_name);
                      return (
                        <div
                          onClick={() => {
                            if (photoUrl) setSelectedPreviewImage({ url: photoUrl, name: item.item_name });
                          }}
                          className={`relative h-44 bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 overflow-hidden ${
                            photoUrl ? 'cursor-zoom-in' : ''
                          }`}
                        >
                          {photoUrl ? (
                            <img
                              src={photoUrl}
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

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadModalTarget({ itemName: item.item_name, currentImageUrl: photoUrl });
                            }}
                            className="absolute bottom-2.5 right-2.5 p-1.5 px-2 rounded-lg bg-black/60 hover:bg-amber-600 text-white shadow-xs backdrop-blur-xs transition flex items-center gap-1 text-[10px] font-medium"
                            title="Upload / ganti foto ke Supabase (&le; 100 KB)"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{photoUrl ? 'Ganti' : 'Upload'}</span>
                          </button>
                        </div>
                      );
                    })()}

                    {/* Body Content */}
                    <div className="p-4 space-y-2.5">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                        {item.item_name}
                      </h3>

                      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 group/spec relative">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1">
                            <strong className="text-slate-700 dark:text-slate-300">Spesifikasi:</strong>{' '}
                            {item.specification ? (
                              <span className="line-clamp-3">{item.specification}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingSpecItem(item)}
                                className="italic text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                + Tambah rincian spesifikasi
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingSpecItem(item)}
                            className="p-1 rounded-md text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/50 transition shrink-0 opacity-80 group-hover/spec:opacity-100"
                            title="Edit spesifikasi teknis"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-3 px-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono">{item.unit || 'unit'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSpecItem(item)}
                        className="text-[10px] text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 font-semibold flex items-center gap-1"
                        title="Edit spesifikasi teknis"
                      >
                        <FileEdit className="w-3 h-3" />
                        <span>Spek</span>
                      </button>
                      <span>&bull;</span>
                      <button
                        type="button"
                        onClick={() => setUploadModalTarget({ itemName: item.item_name, currentImageUrl: getPrimaryPhotoUrl(item.photo_url, item.item_name) })}
                        className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1"
                        title="Upload foto aset"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Foto</span>
                      </button>
                      <span>&bull;</span>
                      <span>{item.is_new_item ? 'Item Baru' : 'Standar CA'}</span>
                    </div>
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
                  {isVisible('image') && <th className="py-3.5 px-4 text-center w-24">Gambar</th>}
                  {isVisible('item_name') && <th className="py-3.5 px-4">Nama Item Aset</th>}
                  {isVisible('unit') && <th className="py-3.5 px-4">Satuan</th>}
                  {isVisible('classification') && <th className="py-3.5 px-4">Klasifikasi / Akun</th>}
                  {isVisible('specification') && <th className="py-3.5 px-4">Spesifikasi Teknis</th>}
                  {isVisible('status') && <th className="py-3.5 px-4">Status Item</th>}
                  {isVisible('actions') && <th className="py-3.5 px-4 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} className="py-12 text-center text-slate-400">
                      Tidak ada data item yang cocok.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((it) => {
                    const photoUrl = getPrimaryPhotoUrl(it.photo_url, it.item_name);
                    return (
                      <tr key={it.id} className="row-interactive transition">
                        {isVisible('image') && (
                          <td className="py-2.5 px-4 text-center">
                            <div className="inline-flex items-center gap-1.5 justify-center">
                              {photoUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPreviewImage({ url: photoUrl, name: it.item_name })}
                                  className="group/img relative inline-block w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-2xs hover:scale-105 transition-transform"
                                  title="Klik untuk memperbesar gambar"
                                >
                                  <img
                                    src={photoUrl}
                                    alt={it.item_name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                    <ZoomIn className="w-3.5 h-3.5 text-white" />
                                  </div>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setUploadModalTarget({ itemName: it.item_name, currentImageUrl: null })}
                                  className="inline-flex flex-col items-center justify-center w-10 h-10 rounded-lg border border-dashed border-amber-300 hover:border-amber-500 dark:border-amber-800 bg-amber-50/40 hover:bg-amber-100/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 transition group/upload"
                                  title="Upload foto ke Supabase (&le; 100 KB)"
                                >
                                  <Upload className="w-4 h-4 group-hover/upload:scale-110 transition-transform" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setUploadModalTarget({ itemName: it.item_name, currentImageUrl: photoUrl })}
                                className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Upload / ganti foto ke Supabase (&le; 100 KB)"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                        {isVisible('item_name') && (
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{it.item_name}</div>
                          </td>
                        )}
                        {isVisible('unit') && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {it.unit || 'unit'}
                            </span>
                          </td>
                        )}
                        {isVisible('classification') && (
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50">
                              {it.classification}
                            </span>
                          </td>
                        )}
                        {isVisible('specification') && (
                          <td className="py-3 px-4 max-w-sm text-xs text-slate-600 dark:text-slate-400">
                            <div className="flex items-start justify-between gap-1.5 group/spec">
                              <div className="flex-1">
                                {it.specification ? (
                                  it.specification.startsWith('http') ? (
                                    <a href={it.specification} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium">
                                      Link Spesifikasi ↗
                                    </a>
                                  ) : (
                                    <span className="line-clamp-2">{it.specification}</span>
                                  )
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingSpecItem(it)}
                                    className="text-[11px] text-amber-600 hover:underline inline-flex items-center gap-1 font-medium"
                                    title="Tambah spesifikasi teknis"
                                  >
                                    <FileEdit className="w-3 h-3" />
                                    <span>+ Tambah Spek</span>
                                  </button>
                                )}
                              </div>
                              {it.specification && (
                                <button
                                  type="button"
                                  onClick={() => setEditingSpecItem(it)}
                                  className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition opacity-0 group-hover/spec:opacity-100 shrink-0"
                                  title="Edit spesifikasi teknis"
                                >
                                  <FileEdit className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                        {isVisible('status') && (
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
                        )}
                        {isVisible('actions') && (
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditingSpecItem(it)}
                              className="interactive-tap inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 text-[11px] font-medium transition shadow-2xs"
                              title="Edit spesifikasi teknis item ini"
                            >
                              <FileEdit className="w-3 h-3 text-amber-500" />
                              <span>Edit Spek</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
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

      {/* Modal Lightbox Zoom Foto */}
      {selectedPreviewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-sm text-slate-900 dark:text-white truncate pr-4">
                {selectedPreviewImage.name}
              </div>
              <button
                onClick={() => setSelectedPreviewImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-950 p-2 border border-slate-100 dark:border-slate-800">
              <img
                src={selectedPreviewImage.url}
                alt={selectedPreviewImage.name}
                className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-xs"
              />
            </div>
            <div className="mt-3 w-full flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
              <span>Foto Master Aset Standar HANTARAN</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const foundItem = items.find(
                      (it) => it.item_name.toLowerCase() === selectedPreviewImage.name.toLowerCase()
                    );
                    setSelectedPreviewImage(null);
                    if (foundItem) {
                      setEditingSpecItem(foundItem);
                    } else {
                      setEditingSpecItem({
                        id: `item-${Date.now()}`,
                        item_name: selectedPreviewImage.name,
                        system_item_name: selectedPreviewImage.name,
                        classification: 'General',
                        specification: '',
                        photo_url: selectedPreviewImage.url,
                        standard_rab_price: 0,
                        total_requests: 1,
                        total_units_needed: 1,
                      });
                    }
                  }}
                  className="interactive-tap flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:border-amber-500 transition shadow-xs"
                >
                  <FileEdit className="w-3.5 h-3.5 text-amber-500" />
                  <span>Edit Spek</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = { itemName: selectedPreviewImage.name, currentImageUrl: selectedPreviewImage.url };
                    setSelectedPreviewImage(null);
                    setUploadModalTarget(target);
                  }}
                  className="interactive-tap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Ganti Foto (&le; 100KB)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload & Kompresi Supabase (< 100 KB) */}
      {uploadModalTarget && (
        <UploadImageModal
          isOpen={!!uploadModalTarget}
          onClose={() => setUploadModalTarget(null)}
          itemName={uploadModalTarget.itemName}
          currentImageUrl={uploadModalTarget.currentImageUrl}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Modal Edit Spesifikasi Item */}
      {editingSpecItem && (
        <EditSpecModal
          isOpen={!!editingSpecItem}
          onClose={() => setEditingSpecItem(null)}
          itemName={editingSpecItem.item_name}
          currentSpecification={editingSpecItem.specification}
          classification={editingSpecItem.classification}
          unit={editingSpecItem.unit}
          photoUrl={getPrimaryPhotoUrl(editingSpecItem.photo_url, editingSpecItem.item_name)}
          onSuccess={handleSpecSuccess}
        />
      )}
    </div>
  );
}
