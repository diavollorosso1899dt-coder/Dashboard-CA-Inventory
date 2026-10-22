'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Camera,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  HelpCircle,
  MessageSquare,
  Plus,
  Minus,
  Wrench,
  Armchair,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { calculateVariance, SOItem } from '@/lib/so-harian/inventoryEngine';
import NotesModal from './NotesModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import { SortableHeader, useTableSort } from '@/components/ui/SortableHeader';

interface PhysicalCountTableProps {
  items: SOItem[];
  onUpdateItems: React.Dispatch<React.SetStateAction<SOItem[]>> | ((items: SOItem[] | ((prev: SOItem[]) => SOItem[])) => void);
}

interface PhysicalCountRowProps {
  item: SOItem;
  globalIdx: number;
  isHighlighted: boolean;
  onPhysicalChange: (itemId: string, rawValue: string | number | null | undefined) => void;
  onStep: (itemId: string, delta: number) => void;
  onOpenNote: (item: SOItem) => void;
  setInputRef: (el: HTMLInputElement | null) => void;
}

/**
 * Highly optimized, memoized table row component.
 * Localizes input state so typing a number has 0ms latency and does not re-render other rows.
 */
const PhysicalCountRow = React.memo(function PhysicalCountRow({
  item,
  globalIdx,
  isHighlighted,
  onPhysicalChange,
  onStep,
  onOpenNote,
  setInputRef,
}: PhysicalCountRowProps) {
  const [localVal, setLocalVal] = useState<string>(
    item.qty_fisik !== null && item.qty_fisik !== undefined ? String(item.qty_fisik) : ''
  );
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external changes (e.g. bulk match, barcode scanner, or reset)
  useEffect(() => {
    setLocalVal(item.qty_fisik !== null && item.qty_fisik !== undefined ? String(item.qty_fisik) : '');
  }, [item.qty_fisik]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleChange = (val: string) => {
    setLocalVal(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onPhysicalChange(item.id, val);
    }, 300);
  };

  const handleBlur = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    onPhysicalChange(item.id, localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      onPhysicalChange(item.id, localVal);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <tr
      className={`transition-colors ${
        isHighlighted
          ? 'bg-amber-100/70 dark:bg-amber-900/40 ring-2 ring-amber-400'
          : item.status_selisih === 'MATCH'
          ? 'hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10'
          : item.status_selisih === 'MINUS' || item.status_selisih === 'PLUS'
          ? 'hover:bg-rose-50/30 dark:hover:bg-rose-950/10 bg-rose-50/10'
          : 'hover:bg-slate-50/50 dark:hover:bg-slate-700/30'
      }`}
    >
      <td className="py-2.5 px-3 text-center text-slate-400">{globalIdx}</td>
      <td className="py-2.5 px-3">
        <div className="font-bold text-slate-900 dark:text-white text-xs">{item.nama_barang}</div>
        {item.lokasi && (
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{item.lokasi}</div>
        )}
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
          {item.kode_barang}
        </span>
      </td>
      <td className="py-2.5 px-3 text-center">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
            item.kategori === 'Perlengkapan Tetap'
              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          }`}
        >
          {item.kategori || 'Peralatan'}
        </span>
      </td>
      <td className="py-2.5 px-2 text-center text-slate-500 font-mono text-[11px]">{item.satuan}</td>
      <td className="py-2.5 px-2 text-right font-medium text-slate-500">{item.stok_awal}</td>
      <td className="py-2.5 px-2 text-right font-medium text-emerald-600">+{item.qty_penerimaan}</td>
      <td className="py-2.5 px-2 text-right font-medium text-rose-600">-{item.qty_ro}</td>
      <td className="py-2.5 px-3 text-right bg-slate-100/70 dark:bg-slate-900/40 font-black text-slate-900 dark:text-white">
        {item.stok_sistem}
      </td>

      {/* Input Fisik with +/- buttons */}
      <td className="py-2 px-3 text-center bg-sky-50/40 dark:bg-sky-950/20">
        <div className="inline-flex items-center space-x-1">
          <button
            type="button"
            onClick={() => onStep(item.id, -1)}
            className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 active:scale-90 transition-transform"
          >
            <Minus className="w-3 h-3" />
          </button>
          <input
            ref={setInputRef}
            type="number"
            min="0"
            step="any"
            value={localVal}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="Hitung"
            className="w-18 py-1 px-1.5 text-center font-bold text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onStep(item.id, 1)}
            className="p-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 active:scale-90 transition-transform"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </td>

      {/* Selisih */}
      <td className="py-2.5 px-3 text-center font-black">
        {item.selisih !== null ? (
          <span
            className={
              item.selisih === 0
                ? 'text-emerald-600'
                : item.selisih < 0
                ? 'text-rose-600'
                : 'text-amber-600'
            }
          >
            {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>

      {/* Status Badge */}
      <td className="py-2.5 px-3 text-center">
        {item.status_selisih === 'MATCH' && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            <span>MATCH</span>
          </span>
        )}
        {item.status_selisih === 'MINUS' && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
            <MinusCircle className="w-3 h-3" />
            <span>MINUS</span>
          </span>
        )}
        {item.status_selisih === 'PLUS' && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3 h-3" />
            <span>PLUS</span>
          </span>
        )}
        {item.status_selisih === 'UNCHECKED' && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
            <HelpCircle className="w-3 h-3" />
            <span>BELUM</span>
          </span>
        )}
      </td>

      {/* Catatan */}
      <td className="py-2.5 px-3 text-center">
        <button
          type="button"
          onClick={() => onOpenNote(item)}
          className={`p-1.5 rounded-lg border text-[11px] font-semibold flex items-center space-x-1 mx-auto transition-colors ${
            item.catatan
              ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{item.catatan ? 'Edit' : '+ Ket'}</span>
        </button>
      </td>
    </tr>
  );
});

export default function PhysicalCountTable({ items = [], onUpdateItems }: PhysicalCountTableProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'Peralatan' | 'Perlengkapan Tetap'>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DIFF' | 'MATCH' | 'UNCHECKED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedNoteItem, setSelectedNoteItem] = useState<SOItem | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Pagination states for high-performance with thousands of items
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Debounce search to prevent recalculations on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Single-pass computation for category & status badge counts
  const counts = useMemo(() => {
    let peralatan = 0;
    let perlengkapan = 0;
    let match = 0;
    let diff = 0;
    let unchecked = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kategori === 'Peralatan') peralatan++;
      else if (item.kategori === 'Perlengkapan Tetap') perlengkapan++;

      const s = item.status_selisih;
      if (s === 'MATCH') match++;
      else if (s === 'MINUS' || s === 'PLUS') diff++;
      else unchecked++;
    }

    return { peralatan, perlengkapan, match, diff, unchecked };
  }, [items]);

  // Reset page when category or status filter changes
  const handleCategoryChange = (cat: 'ALL' | 'Peralatan' | 'Perlengkapan Tetap') => {
    setSelectedCategory(cat);
    setCurrentPage(1);
  };

  const handleFilterChange = (filter: 'ALL' | 'DIFF' | 'MATCH' | 'UNCHECKED') => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  // High-performance direct-index mutation avoiding O(N) object recreation
  const handlePhysicalChange = useCallback(
    (itemId: string, rawValue: string | number | null | undefined) => {
      onUpdateItems((prevItems: SOItem[]) => {
        const idx = prevItems.findIndex((i) => i.id === itemId);
        if (idx === -1) return prevItems;

        const item = prevItems[idx];
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
          if (item.qty_fisik === null && item.status_selisih === 'UNCHECKED') return prevItems;
          const copy = [...prevItems];
          copy[idx] = {
            ...item,
            qty_fisik: null,
            selisih: null,
            status_selisih: 'UNCHECKED',
          };
          return copy;
        }

        const numVal = Number(rawValue);
        if (isNaN(numVal)) return prevItems;

        const { selisih, status } = calculateVariance(numVal, item.stok_sistem);
        if (item.qty_fisik === numVal && item.selisih === selisih && item.status_selisih === status) {
          return prevItems;
        }

        const copy = [...prevItems];
        copy[idx] = {
          ...item,
          qty_fisik: numVal,
          selisih,
          status_selisih: status,
        };
        return copy;
      });
    },
    [onUpdateItems]
  );

  const handleStep = useCallback(
    (itemId: string, delta: number) => {
      onUpdateItems((prevItems: SOItem[]) => {
        const idx = prevItems.findIndex((i) => i.id === itemId);
        if (idx === -1) return prevItems;
        const item = prevItems[idx];
        const current = item.qty_fisik !== null && item.qty_fisik !== undefined ? item.qty_fisik : item.stok_sistem;
        const nextVal = Math.max(0, current + delta);

        const { selisih, status } = calculateVariance(nextVal, item.stok_sistem);
        const copy = [...prevItems];
        copy[idx] = {
          ...item,
          qty_fisik: nextVal,
          selisih,
          status_selisih: status,
        };
        return copy;
      });
    },
    [onUpdateItems]
  );

  const handleSaveNote = useCallback(
    (itemId: string, newNote: string) => {
      onUpdateItems((prevItems: SOItem[]) => {
        const idx = prevItems.findIndex((i) => i.id === itemId);
        if (idx === -1) return prevItems;
        const copy = [...prevItems];
        copy[idx] = { ...copy[idx], catatan: newNote };
        return copy;
      });
    },
    [onUpdateItems]
  );

  // Barcode Scanner: automatically resolves item, calculates page, jumps to it, increments by +1, and focuses input
  const handleScanSuccess = (scannedSku: string) => {
    const cleanQuery = scannedSku.toLowerCase().trim();
    if (!cleanQuery) return;

    // 1. Try exact match on code, name, or id
    let targetItem = items.find(
      (i) => i.kode_barang.toLowerCase() === cleanQuery || i.nama_barang.toLowerCase() === cleanQuery || i.id === cleanQuery
    );

    // 2. Fallback to partial match
    if (!targetItem) {
      targetItem = items.find(
        (i) => i.kode_barang.toLowerCase().includes(cleanQuery) || i.nama_barang.toLowerCase().includes(cleanQuery)
      );
    }

    if (targetItem) {
      setHighlightedId(targetItem.id);
      setSearchTerm('');
      setSelectedCategory('ALL');
      setActiveFilter('ALL');

      // Auto-step physical count +1
      handleStep(targetItem.id, 1);

      // Calculate target page
      const targetIndex = items.findIndex((i) => i.id === targetItem.id);
      const targetPage = Math.floor(targetIndex / pageSize) + 1;
      setCurrentPage(targetPage);

      setTimeout(() => {
        const inputEl = inputRefs.current.get(targetItem.id);
        if (inputEl) {
          inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          inputEl.focus();
          inputEl.select();
        }
      }, 150);
    } else {
      alert(`Kode barang / Barcode "${scannedSku}" tidak ditemukan dalam daftar Stock Opname.`);
    }
  };


  const handleMatchAllRemaining = () => {
    if (!window.confirm('Tandai semua item yang belum dicek sebagai COCOK (Fisik = Stok Sistem)?')) return;

    onUpdateItems((prevItems: SOItem[]) => {
      return prevItems.map((item) => {
        const isVisibleCategory = selectedCategory === 'ALL' || item.kategori === selectedCategory;
        if (item.status_selisih === 'UNCHECKED' && isVisibleCategory) {
          return {
            ...item,
            qty_fisik: item.stok_sistem,
            selisih: 0,
            status_selisih: 'MATCH' as const,
          };
        }
        return item;
      });
    });
  };

  // Filtered items (Memoized)
  const filteredItems = useMemo(() => {
    const term = debouncedSearch.toLowerCase().trim();
    return items.filter((item) => {
      if (selectedCategory !== 'ALL' && item.kategori !== selectedCategory) {
        return false;
      }

      if (activeFilter === 'MATCH' && item.status_selisih !== 'MATCH') return false;
      if (activeFilter === 'DIFF' && item.status_selisih !== 'MINUS' && item.status_selisih !== 'PLUS') return false;
      if (activeFilter === 'UNCHECKED' && item.status_selisih !== 'UNCHECKED') return false;

      if (term) {
        return (
          item.kode_barang.toLowerCase().includes(term) ||
          item.nama_barang.toLowerCase().includes(term) ||
          (item.lokasi && item.lokasi.toLowerCase().includes(term))
        );
      }

      return true;
    });
  }, [items, selectedCategory, activeFilter, debouncedSearch]);

  const customSoSortFns = useMemo(
    () => ({
      nama_barang: (a: SOItem, b: SOItem) =>
        (a.nama_barang || '').localeCompare(b.nama_barang || '', 'id', { sensitivity: 'base' }),
      kode_barang: (a: SOItem, b: SOItem) =>
        (a.kode_barang || '').localeCompare(b.kode_barang || '', 'id', { numeric: true }),
      kategori: (a: SOItem, b: SOItem) =>
        (a.kategori || '').localeCompare(b.kategori || '', 'id'),
      satuan: (a: SOItem, b: SOItem) =>
        (a.satuan || '').localeCompare(b.satuan || '', 'id'),
      stok_awal: (a: SOItem, b: SOItem) => (a.stok_awal || 0) - (b.stok_awal || 0),
      total_masuk: (a: SOItem, b: SOItem) => (a.qty_penerimaan || 0) - (b.qty_penerimaan || 0),
      total_keluar: (a: SOItem, b: SOItem) => (a.qty_ro || 0) - (b.qty_ro || 0),
      stok_sistem: (a: SOItem, b: SOItem) => (a.stok_sistem || 0) - (b.stok_sistem || 0),
      qty_fisik: (a: SOItem, b: SOItem) => (Number(a.qty_fisik) || 0) - (Number(b.qty_fisik) || 0),
      selisih: (a: SOItem, b: SOItem) => (a.selisih || 0) - (b.selisih || 0),
      status_selisih: (a: SOItem, b: SOItem) =>
        (a.status_selisih || '').localeCompare(b.status_selisih || '', 'id'),
    }),
    []
  );

  const {
    sortField: soSortField,
    sortDirection: soSortDirection,
    handleSort: handleSoSort,
    sortedItems: sortedFilteredItems,
  } = useTableSort<SOItem>(filteredItems, null, 'asc', customSoSortFns);

  // Paginated items slice (Only renders pageSize rows, avoiding massive DOM lag)
  const totalPages = Math.max(1, Math.ceil(sortedFilteredItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return sortedFilteredItems.slice(startIndex, startIndex + pageSize);
  }, [sortedFilteredItems, safePage, pageSize]);

  const startIndexDisplay = filteredItems.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndexDisplay = Math.min(safePage * pageSize, filteredItems.length);

  return (
    <div className="space-y-4 animate-fade-in max-w-6xl mx-auto">
      {/* Category Pills & Barcode Scan Toolbar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Category Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => handleCategoryChange('ALL')}
            className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              selectedCategory === 'ALL'
                ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Semua Kategori</span>
            <span className="text-[10px] ml-1 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full">
              {items.length}
            </span>
          </button>

          <button
            onClick={() => handleCategoryChange('Peralatan')}
            className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              selectedCategory === 'Peralatan'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-amber-600'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Peralatan</span>
            <span className="text-[10px] ml-1 bg-amber-400/30 text-amber-900 dark:text-amber-100 px-1.5 py-0.2 rounded-full">
              {counts.peralatan}
            </span>
          </button>

          <button
            onClick={() => handleCategoryChange('Perlengkapan Tetap')}
            className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              selectedCategory === 'Perlengkapan Tetap'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-indigo-600'
            }`}
          >
            <Armchair className="w-3.5 h-3.5" />
            <span>Perlengkapan Tetap</span>
            <span className="text-[10px] ml-1 bg-indigo-400/30 text-indigo-900 dark:text-indigo-100 px-1.5 py-0.2 rounded-full">
              {counts.perlengkapan}
            </span>
          </button>
        </div>

        {/* Barcode Scanner Button */}
        <button
          onClick={() => setIsScannerOpen(true)}
          className="w-full md:w-auto px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-all active:scale-95"
        >
          <Camera className="w-4 h-4" />
          <span>Scan Barcode Kamera (HP / PC)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari SKU, Nama Barang, Rak..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            onClick={() => handleFilterChange('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            Semua ({items.length})
          </button>
          <button
            onClick={() => handleFilterChange('DIFF')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'DIFF'
                ? 'bg-rose-600 text-white'
                : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            Selisih ({counts.diff})
          </button>
          <button
            onClick={() => handleFilterChange('MATCH')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'MATCH'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            Cocok ({counts.match})
          </button>
          <button
            onClick={() => handleFilterChange('UNCHECKED')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'UNCHECKED'
                ? 'bg-slate-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            Belum Cek ({counts.unchecked})
          </button>
        </div>

        {/* Quick Bulk Action */}
        <button
          onClick={handleMatchAllRemaining}
          className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center space-x-1"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Cocokkan Sisa</span>
        </button>
      </div>

      {/* Main Table View */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3 min-w-[220px]">
                  <SortableHeader
                    label="Nama Item Barang"
                    field="nama_barang"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                  />
                </th>
                <th className="py-3 px-2 text-center w-28">
                  <SortableHeader
                    label="Kode / SKU"
                    field="kode_barang"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-3 text-center">
                  <SortableHeader
                    label="Kategori"
                    field="kategori"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-2 text-center">
                  <SortableHeader
                    label="Sat"
                    field="satuan"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-2 text-right">
                  <SortableHeader
                    label="Awal"
                    field="stok_awal"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="right"
                  />
                </th>
                <th className="py-3 px-2 text-right text-emerald-600">
                  <SortableHeader
                    label="Masuk"
                    field="total_masuk"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="right"
                  />
                </th>
                <th className="py-3 px-2 text-right text-rose-600">
                  <SortableHeader
                    label="RO"
                    field="total_keluar"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="right"
                  />
                </th>
                <th className="py-3 px-3 text-right bg-slate-100/70 dark:bg-slate-900/40 font-black">
                  <SortableHeader
                    label="Stok Sistem"
                    field="stok_sistem"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="right"
                  />
                </th>
                <th className="py-3 px-3 text-center bg-sky-50/70 dark:bg-sky-950/30 font-black w-44">
                  <SortableHeader
                    label="Input Fisik SO"
                    field="qty_fisik"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-3 text-center">
                  <SortableHeader
                    label="Selisih"
                    field="selisih"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-3 text-center">
                  <SortableHeader
                    label="Status"
                    field="status_selisih"
                    currentSortField={soSortField}
                    currentSortDirection={soSortDirection}
                    onSort={handleSoSort}
                    align="center"
                  />
                </th>
                <th className="py-3 px-3 text-center w-28">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-slate-700 dark:text-slate-300">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    Tidak ada barang yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const globalIdx = (safePage - 1) * pageSize + idx + 1;
                  const isHighlighted = highlightedId === item.id;
                  return (
                    <PhysicalCountRow
                      key={item.id}
                      item={item}
                      globalIdx={globalIdx}
                      isHighlighted={isHighlighted}
                      onPhysicalChange={handlePhysicalChange}
                      onStep={handleStep}
                      onOpenNote={setSelectedNoteItem}
                      setInputRef={(el) => {
                        if (el) inputRefs.current.set(item.id, el);
                        else inputRefs.current.delete(item.id);
                      }}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* High-Performance Pagination Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Menampilkan <strong className="text-slate-700 dark:text-slate-200">{startIndexDisplay}</strong> - <strong className="text-slate-700 dark:text-slate-200">{endIndexDisplay}</strong> dari <strong className="text-slate-900 dark:text-white">{filteredItems.length}</strong> barang
          </div>

          <div className="flex items-center space-x-3">
            {/* Page Size Dropdown */}
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Baris:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold focus:ring-1 focus:ring-sky-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Halaman Pertama"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-3 py-1 font-bold text-slate-700 dark:text-slate-300">
                {safePage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Selanjutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Halaman Terakhir"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Modal */}
      <NotesModal
        isOpen={!!selectedNoteItem}
        onClose={() => setSelectedNoteItem(null)}
        item={selectedNoteItem}
        onSaveNote={handleSaveNote}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
