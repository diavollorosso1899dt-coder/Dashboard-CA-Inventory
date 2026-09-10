'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  Edit3, 
  Store,
  Printer,
  CheckSquare,
  Square,
  AlertTriangle,
  Package,
  Clock,
  CheckCircle2,
  RefreshCw,
  X,
  ArrowRightLeft
} from 'lucide-react';
import { AssetRequest, RegionType } from '@/lib/supabase/types';
import { formatDateTime, formatDateOnly, formatLeadTime } from '@/lib/utils/date-formatter';
import { AssetDetailModal } from './AssetDetailModal';
import { BranchBastModal } from './BranchBastModal';

interface AssetDataTableProps {
  initialItems: AssetRequest[];
  regionFilter?: RegionType;
}

type QuickFilterType = 'ALL' | 'OVERDUE' | 'READY_STOCK' | 'NEED_PR' | 'COMPLETED' | 'TRANSFER_SYSTEM';

export function AssetDataTable({ initialItems = [], regionFilter = 'ALL' }: AssetDataTableProps) {
  const [items, setItems] = useState<AssetRequest[]>(initialItems);
  const [search, setSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionType>(regionFilter);
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedStock, setSelectedStock] = useState<string>('ALL');
  const [selectedRab, setSelectedRab] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  
  // Modal & Selection States
  const [selectedItem, setSelectedItem] = useState<AssetRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [updatingRowId, setUpdatingRowId] = useState<string | null>(null);
  const [systemTransferIds, setSystemTransferIds] = useState<string[]>([]);

  // BAST Modal State
  const [isBastModalOpen, setIsBastModalOpen] = useState(false);
  const [bastBranch, setBastBranch] = useState<string>('');

  useEffect(() => {
    setItems(initialItems || []);
    const initialTransferList = (initialItems || [])
      .filter((i) => i.is_system_transfer)
      .map((i) => i.id || i.external_id);
    setSystemTransferIds(initialTransferList);
    setCurrentPage(1);
  }, [initialItems]);

  const handleToggleSystemTransfer = (item: AssetRequest) => {
    const id = item.id || item.external_id;
    const isTransfer = systemTransferIds.includes(id) || item.is_system_transfer;
    let updatedIds: string[];
    if (isTransfer) {
      updatedIds = systemTransferIds.filter((i) => i !== id);
    } else {
      updatedIds = [...systemTransferIds, id];
    }
    setSystemTransferIds(updatedIds);
    setItems((prev) =>
      prev.map((it) => ((it.id === id || it.external_id === id) ? { ...it, is_system_transfer: !isTransfer } : it))
    );
  };

  // Extract unique branches
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.branch_name) set.add(i.branch_name);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedRegion !== 'ALL' && item.region !== selectedRegion) return false;
      if (selectedBranch !== 'ALL' && item.branch_name !== selectedBranch) return false;

      // Quick Filter Chips Logic
      if (quickFilter === 'OVERDUE' && (item.lead_time_days || 0) <= 14) return false;
      if (quickFilter === 'READY_STOCK' && (item.quantity_stock_allocated || 0) <= 0) return false;
      if (quickFilter === 'NEED_PR' && (item.quantity_pr || 0) <= 0) return false;
      if (quickFilter === 'COMPLETED' && !(item.item_delivery_status || '').toLowerCase().includes('lengkap')) return false;
      if (quickFilter === 'TRANSFER_SYSTEM' && !systemTransferIds.includes(item.id || item.external_id) && !item.is_system_transfer) return false;

      if (selectedStatus !== 'ALL') {
        const itemStatus = (item.item_delivery_status || '').toLowerCase();
        if (selectedStatus === 'LENGKAP' && !itemStatus.includes('lengkap')) return false;
        if (selectedStatus === 'SEBAGIAN' && !itemStatus.includes('sebagian')) return false;
        if (selectedStatus === 'PROSES' && !itemStatus.includes('proses')) return false;
      }

      if (selectedStock !== 'ALL') {
        const itemStock = (item.stock_status || '').toLowerCase();
        if (selectedStock === 'READY' && !itemStock.includes('ready')) return false;
        if (selectedStock === 'KOSONG' && !itemStock.includes('kosong')) return false;
      }

      if (selectedRab && !item.rab_number.toLowerCase().includes(selectedRab.toLowerCase())) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          item.item_name.toLowerCase().includes(q) ||
          item.branch_name.toLowerCase().includes(q) ||
          item.requester_name.toLowerCase().includes(q) ||
          item.rab_number.toLowerCase().includes(q) ||
          item.classification.toLowerCase().includes(q) ||
          (item.vendor_name && item.vendor_name.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [items, selectedRegion, selectedBranch, selectedStatus, selectedStock, selectedRab, quickFilter, search]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Selection Handlers
  const isAllCurrentPageSelected = useMemo(() => {
    if (paginatedItems.length === 0) return false;
    return paginatedItems.every((it) => selectedIds.includes(it.id || it.external_id));
  }, [paginatedItems, selectedIds]);

  const handleToggleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      const pageIds = new Set(paginatedItems.map((i) => i.id || i.external_id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...paginatedItems.map((i) => i.id || i.external_id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Inline Quick Status Update Handler
  const handleInlineStatusChange = async (item: AssetRequest, newStatus: string) => {
    const id = item.id || item.external_id;
    try {
      setUpdatingRowId(id);
      
      const updatedItem: AssetRequest = {
        ...item,
        item_delivery_status: newStatus,
        is_manually_edited: true,
        procurement_status: newStatus.toLowerCase().includes('lengkap') ? 'selesai' : 'proses',
        received_date: newStatus.toLowerCase().includes('lengkap') ? new Date().toISOString() : item.received_date,
      };

      setItems((prev) => prev.map((it) => ((it.id === id || it.external_id === id) ? updatedItem : it)));

      const res = await fetch(`/api/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_delivery_status: newStatus,
          procurement_status: newStatus.toLowerCase().includes('lengkap') ? 'selesai' : 'proses',
          received_date: newStatus.toLowerCase().includes('lengkap') ? new Date().toISOString() : null,
          is_manually_edited: true,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }
    } catch (err) {
      console.error('Error in inline status change:', err);
      setItems((prev) => prev.map((it) => ((it.id === id || it.external_id === id) ? item : it)));
    } finally {
      setUpdatingRowId(null);
    }
  };

  // Bulk Action Update Handler
  const handleBulkUpdateStatus = async (status: string) => {
    if (selectedIds.length === 0) return;
    try {
      setIsBulkUpdating(true);
      
      setItems((prev) =>
        prev.map((it) => {
          const itId = it.id || it.external_id;
          if (selectedIds.includes(itId)) {
            return {
              ...it,
              item_delivery_status: status,
              is_manually_edited: true,
              procurement_status: status.toLowerCase().includes('lengkap') ? 'selesai' : 'proses',
            };
          }
          return it;
        })
      );

      const res = await fetch('/api/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          updates: {
            item_delivery_status: status,
            procurement_status: status.toLowerCase().includes('lengkap') ? 'selesai' : 'proses',
            is_manually_edited: true,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('Bulk update failed');
      }

      setSelectedIds([]);
    } catch (err) {
      console.error('Error during bulk update:', err);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleOpenDetail = (item: AssetRequest) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleSaveSuccess = (updated: AssetRequest) => {
    setItems((prev) =>
      prev.map((it) => (it.id === updated.id || it.external_id === updated.external_id ? updated : it))
    );
  };

  const handleOpenBast = () => {
    const branchToUse = selectedBranch !== 'ALL' ? selectedBranch : (uniqueBranches[0] || 'Cabang');
    setBastBranch(branchToUse);
    setIsBastModalOpen(true);
  };

  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Region',
      'Tanggal Order',
      'Pengaju',
      'Divisi',
      'No RAB',
      'Cabang',
      'Item',
      'Klasifikasi',
      'Kebutuhan',
      'Stok Gudang',
      'PR',
      'Status Stok',
      'Tanggal Opening',
      'Status Barang',
      'SLA Pengadaan',
      'PIC Penerima',
    ];

    const rows = filteredItems.map((i) => [
      i.external_id,
      i.region,
      formatDateTime(i.order_datetime),
      i.requester_name,
      i.requester_division,
      i.rab_number,
      i.branch_name,
      `"${i.item_name.replace(/"/g, '""')}"`,
      i.classification,
      i.quantity_needed,
      i.quantity_stock_allocated,
      i.quantity_pr,
      i.stock_status,
      formatDateOnly(i.opening_date),
      i.item_delivery_status,
      i.lead_time_days,
      i.pic_receiver,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Asset_Control_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3.5">
      {/* 1. Google Material 3 Filter Chips Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] mr-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          Filter Cepat:
        </span>
        <button
          onClick={() => { setQuickFilter('ALL'); setCurrentPage(1); }}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            quickFilter === 'ALL'
              ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]'
          }`}
        >
          Semua Item ({items.length})
        </button>
        <button
          onClick={() => { setQuickFilter('OVERDUE'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            quickFilter === 'OVERDUE'
              ? 'bg-[#fce8e6] dark:bg-[#601410] border border-[#f9dedc] dark:border-[#601410] text-[#b3261e] dark:text-[#f2b8b5]'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5] hover:text-[#b3261e] dark:hover:text-[#f2b8b5]'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-[#b06000]" />
          Lewat Target (&gt;14 Hari)
        </button>
        <button
          onClick={() => { setQuickFilter('READY_STOCK'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            quickFilter === 'READY_STOCK'
              ? 'bg-[#e6f4ea] dark:bg-[#0f5223] border border-[#ceead6] dark:border-[#0f5223] text-[#137333] dark:text-[#6dd58c]'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5] hover:text-[#137333] dark:hover:text-[#6dd58c]'
          }`}
        >
          <Package className="h-3.5 w-3.5 text-[#137333]" />
          Siap Kirim (Stok SCGA)
        </button>
        <button
          onClick={() => { setQuickFilter('NEED_PR'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            quickFilter === 'NEED_PR'
              ? 'bg-[#e8f0fe] dark:bg-[#004a77] border border-[#d2e3fc] dark:border-[#004a77] text-[#0b57d0] dark:text-[#c2e7ff]'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]'
          }`}
        >
          <Clock className="h-3.5 w-3.5 text-[#0b57d0]" />
          Proses PR (Beli Baru)
        </button>
        <button
          onClick={() => { setQuickFilter('COMPLETED'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            quickFilter === 'COMPLETED'
              ? 'bg-[#c4eed0] dark:bg-[#072711] border border-[#137333] text-[#072711] dark:text-[#6dd58c]'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5] hover:text-[#137333] dark:hover:text-[#6dd58c]'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-[#137333]" />
          Sudah Lengkap
        </button>
        <button
          onClick={() => { setQuickFilter('TRANSFER_SYSTEM'); setCurrentPage(1); }}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            quickFilter === 'TRANSFER_SYSTEM'
              ? 'bg-[#c2e7ff] dark:bg-[#004a77] border border-[#0b57d0] dark:border-[#a8c7fa] text-[#001d35] dark:text-[#c2e7ff] shadow-sm'
              : 'bg-[#ffffff] dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#e8f0fe] dark:hover:bg-[#004a77]/30'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          Role Transfer ({systemTransferIds.length})
        </button>
      </div>

      {/* 2. Google M3 Search & Filter Card */}
      <div className="panel-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Google Search Bar */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
            <input
              type="text"
              placeholder="Cari item, cabang, pengaju, No RAB..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] pl-10 pr-4 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:border-[#0b57d0] focus:bg-[#ffffff] dark:focus:bg-[#282a2c] focus:outline-none transition-all shadow-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
            <span className="text-xs text-[#444746] dark:text-[#c4c7c5] font-medium mr-1">
              Total: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{filteredItems.length}</strong> baris
            </span>
            
            {/* BAST Print Button */}
            <button
              onClick={handleOpenBast}
              className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-3.5 py-1.5 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors shadow-sm"
              title="Cetak Berita Acara Serah Terima Aset Cabang"
            >
              <Printer className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>Cetak BAST</span>
            </button>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-3.5 py-1.5 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5 text-[#444746] dark:text-[#c4c7c5]" />
              Unduh CSV
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-2 border-t border-[#e0e2ec] dark:border-[#444746]">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] mb-1">
              Wilayah
            </label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value as RegionType);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="ALL">Semua Wilayah</option>
              <option value="JABODETABEK">JABODETABEK</option>
              <option value="KALBAR">KALBAR</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] mb-1">
              Cabang
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="ALL">Semua Cabang ({uniqueBranches.length})</option>
              {uniqueBranches.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] mb-1">
              Status Barang
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="ALL">Semua Status</option>
              <option value="LENGKAP">Lengkap</option>
              <option value="SEBAGIAN">Diterima Sebagian</option>
              <option value="PROSES">On Proses / Belum</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] mb-1">
              Status Stok Gudang
            </label>
            <select
              value={selectedStock}
              onChange={(e) => {
                setSelectedStock(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            >
              <option value="ALL">Semua Stok</option>
              <option value="READY">Ready (Gudang)</option>
              <option value="KOSONG">Kosong (PR)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-[#444746] dark:text-[#c4c7c5] mb-1">
              Filter No RAB
            </label>
            <input
              type="text"
              placeholder="Cari No RAB..."
              value={selectedRab}
              onChange={(e) => {
                setSelectedRab(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-2.5 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. Sticky Multi-Select Bulk Actions Bar (Google M3 Pill Floating Bar) */}
      {selectedIds.length > 0 && (
        <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d2e3fc] dark:border-[#004a77] bg-[#ffffff] dark:bg-[#1e1f20] px-5 py-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] text-xs font-bold text-white dark:text-[#041e49] shadow-sm">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              Item dipilih untuk aksi massal:
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleBulkUpdateStatus('Lengkap')}
              disabled={isBulkUpdating}
              className="flex items-center gap-1.5 rounded-full bg-[#137333] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0f5223] transition-colors disabled:opacity-50 shadow-sm"
            >
              {isBulkUpdating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Tandai Lengkap
            </button>
            <button
              onClick={() => handleBulkUpdateStatus('Ready Gudang SCGA')}
              disabled={isBulkUpdating}
              className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0842a0] transition-colors disabled:opacity-50 shadow-sm"
            >
              <Package className="h-3.5 w-3.5" />
              Tandai Ready Gudang
            </button>
            <button
              onClick={() => handleBulkUpdateStatus('On Proses PR')}
              disabled={isBulkUpdating}
              className="flex items-center gap-1.5 rounded-full bg-[#b06000] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#8f4e00] transition-colors disabled:opacity-50 shadow-sm"
            >
              <Clock className="h-3.5 w-3.5" />
              Tandai On Proses PR
            </button>
            <button
              onClick={() => {
                const selectedSystemItems = items.filter((i) => selectedIds.includes(i.id || i.external_id));
                const itemsParam = encodeURIComponent(JSON.stringify(selectedSystemItems.map(i => ({ item_name: i.item_name, quantity: i.quantity_needed }))));
                window.location.href = `/monitoring/transfer?items=${itemsParam}`;
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#6750a4] dark:bg-[#d0bcff] px-3.5 py-1.5 text-xs font-semibold text-white dark:text-[#381e72] hover:bg-[#523b8a] transition-colors shadow-sm"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Ke Pemantauan Transfer ({selectedIds.length})
            </button>
            <button
              onClick={() => {
                const firstSelectedItem = items.find((i) => selectedIds.includes(i.id || i.external_id));
                const branchToUse = firstSelectedItem?.branch_name || (selectedBranch !== 'ALL' ? selectedBranch : uniqueBranches[0]);
                setBastBranch(branchToUse);
                setIsBastModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-3.5 py-1.5 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak BAST ({selectedIds.length} Item)
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="flex items-center gap-1 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-3 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Batal
            </button>
          </div>
        </div>
      )}

      {/* 4. Google Sheets Style Main Data Table */}
      <div className="panel-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
            <thead className="bg-[#f0f4f9] dark:bg-[#1e1f20] text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5] border-b border-[#e0e2ec] dark:border-[#444746]">
              <tr>
                <th className="py-3.5 px-3 w-8 text-center">
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-[#747775] dark:text-[#8e918f] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]"
                    title="Pilih semua baris di halaman ini"
                  >
                    {isAllCurrentPageSelected ? (
                      <CheckSquare className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-3">Waktu Order</th>
                <th className="py-3.5 px-3">Cabang &amp; Pengaju</th>
                <th className="py-3.5 px-3">Item &amp; Klasifikasi</th>
                <th className="py-3.5 px-3 text-center">Kebutuhan</th>
                <th className="py-3.5 px-3">No. RAB</th>
                <th className="py-3.5 px-3">Target Opening</th>
                <th className="py-3.5 px-3">Status Stok</th>
                <th className="py-3.5 px-3">Status Barang</th>
                <th className="py-3.5 px-3 text-center">Transfer Sistem</th>
                <th className="py-3.5 px-3 text-center">SLA</th>
                <th className="py-3.5 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-[#747775] dark:text-[#8e918f]">
                    Tidak ada data aset yang cocok dengan filter. Coba ubah kata kunci pencarian atau filter wilayah.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const itemId = item.id || item.external_id;
                  const isSelected = selectedIds.includes(itemId);
                  const isCompleted = (item.item_delivery_status || '').toLowerCase().includes('lengkap');
                  const isPartial = (item.item_delivery_status || '').toLowerCase().includes('sebagian');
                  const isReadyStock = (item.stock_status || '').toLowerCase().includes('ready');
                  const isUpdating = updatingRowId === itemId;

                  return (
                    <tr
                      key={itemId}
                      className={`hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors ${
                        isSelected ? 'bg-[#e8f0fe] dark:bg-[#004a77]/30' : ''
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectItem(itemId);
                          }}
                          className="text-[#747775] hover:text-[#0b57d0] dark:hover:text-[#a8c7fa]"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* 1. Timestamp Input */}
                      <td className="py-2.5 px-3 whitespace-nowrap cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                          {formatDateTime(item.order_datetime)}
                        </div>
                        <span className="inline-block mt-0.5 rounded-full px-2 py-0.2 text-[9px] font-medium bg-[#f0f4f9] dark:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5]">
                          {item.region}
                        </span>
                      </td>

                      {/* 2. Cabang & Pengaju */}
                      <td className="py-2.5 px-3 cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <div className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] line-clamp-1">
                          {item.branch_name}
                        </div>
                        <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] line-clamp-1">
                          {item.requester_name} ({item.requester_division || 'BusDev'})
                        </div>
                      </td>

                      {/* 3. Item & Klasifikasi */}
                      <td className="py-2.5 px-3 max-w-xs cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <div className="font-medium text-[#1f1f1f] dark:text-[#e3e3e3] line-clamp-1">
                          {item.item_name}
                        </div>
                        <div className="text-[10px] text-[#747775] dark:text-[#8e918f] line-clamp-1">
                          {item.classification} {item.specification ? `(${item.specification})` : ''}
                        </div>
                      </td>

                      {/* 4. Kebutuhan */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <span className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{item.quantity_needed} unit</span>
                        <div className="text-[10px] text-[#747775] dark:text-[#8e918f]">
                          Stok: {item.quantity_stock_allocated} | PR: {item.quantity_pr}
                        </div>
                      </td>

                      {/* 5. No RAB */}
                      <td className="py-2.5 px-3 whitespace-nowrap cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <span className="font-medium text-[#1f1f1f] dark:text-[#e3e3e3]">
                          {item.rab_number || '-'}
                        </span>
                      </td>

                      {/* 6. Target Opening */}
                      <td className="py-2.5 px-3 whitespace-nowrap cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <div className="flex items-center gap-1 text-[#1f1f1f] dark:text-[#e3e3e3]">
                          <Store className="h-3 w-3 text-[#0b57d0] dark:text-[#a8c7fa]" />
                          {formatDateOnly(item.opening_date)}
                        </div>
                      </td>

                      {/* 7. Status Stok */}
                      <td className="py-2.5 px-3 whitespace-nowrap cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            isReadyStock
                              ? 'badge-complete'
                              : 'badge-alert'
                          }`}
                        >
                          {item.stock_status || 'Not Ready'}
                        </span>
                      </td>

                      {/* 8. Status Barang (Google M3 Inline Dropdown) */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={item.item_delivery_status || 'On Proses PR'}
                            disabled={isUpdating}
                            onChange={(e) => handleInlineStatusChange(item, e.target.value)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors focus:outline-none ${
                              isCompleted
                                ? 'border-[#ceead6] dark:border-[#0f5223] bg-[#e6f4ea] dark:bg-[#0f5223]/40 text-[#137333] dark:text-[#6dd58c]'
                                : isPartial
                                ? 'border-[#d2e3fc] dark:border-[#004a77] bg-[#e8f0fe] dark:bg-[#004a77]/40 text-[#0b57d0] dark:text-[#a8c7fa]'
                                : 'border-[#feeed9] dark:border-[#4a2800] bg-[#fef7e0] dark:bg-[#4a2800]/40 text-[#b06000] dark:text-[#ffb951]'
                            }`}
                          >
                            <option value="Lengkap">✓ Lengkap</option>
                            <option value="Ready Gudang SCGA">📦 Ready Gudang SCGA</option>
                            <option value="Dalam Pengiriman (SCGA)">🚚 Dalam Pengiriman</option>
                            <option value="Diterima Sebagian">⚡ Diterima Sebagian</option>
                            <option value="On Proses PR">📝 On Proses PR</option>
                          </select>
                          {isUpdating && <RefreshCw className="h-3 w-3 animate-spin text-[#747775]" />}
                        </div>
                      </td>

                      {/* 8b. Transfer Sistem Checklist */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSystemTransfer(item);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all border ${
                            systemTransferIds.includes(itemId) || item.is_system_transfer
                              ? 'border-[#0b57d0] bg-[#e8f0fe] text-[#0b57d0] dark:border-[#a8c7fa] dark:bg-[#004a77]/50 dark:text-[#a8c7fa] shadow-xs'
                              : 'border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] text-[#747775] dark:bg-[#282a2c] dark:text-[#8e918f] hover:bg-[#e0e2ec]'
                          }`}
                          title="Centang untuk memasukkan item ini ke Role Transfer Sistem"
                        >
                          {systemTransferIds.includes(itemId) || item.is_system_transfer ? (
                            <>
                              <CheckSquare className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                              <span>Role Transfer</span>
                            </>
                          ) : (
                            <>
                              <Square className="h-3.5 w-3.5 text-[#747775]" />
                              <span>Non Transfer</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* 9. SLA */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-medium text-[#1f1f1f] dark:text-[#e3e3e3] cursor-pointer" onClick={() => handleOpenDetail(item)}>
                        {formatLeadTime(item.lead_time_days)}
                      </td>

                      {/* 10. Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenDetail(item)}
                          className="rounded-full bg-[#f0f4f9] dark:bg-[#282a2c] p-1.5 text-[#444746] dark:text-[#c4c7c5] hover:bg-[#0b57d0] hover:text-white dark:hover:bg-[#a8c7fa] dark:hover:text-[#041e49] transition-colors"
                          title="Lihat Detail & Edit Lengkap"
                          aria-label={`Edit ${item.item_name}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] p-3.5 text-xs">
          <div className="flex items-center gap-2 text-[#444746] dark:text-[#c4c7c5]">
            <span>Tampilkan:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-2 py-1 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              {Math.min((currentPage - 1) * pageSize + 1, filteredItems.length)} -{' '}
              {Math.min(currentPage * pageSize, filteredItems.length)} dari {filteredItems.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] p-1.5 text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] disabled:opacity-40 transition-colors"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-medium">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] p-1.5 text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] disabled:opacity-40 transition-colors"
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail & Edit Modal */}
      {isModalOpen && selectedItem && (
        <AssetDetailModal
          item={selectedItem}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedItem(null);
          }}
          onSaveSuccess={handleSaveSuccess}
        />
      )}

      {/* BAST Print Modal */}
      {isBastModalOpen && (
        <BranchBastModal
          isOpen={isBastModalOpen}
          onClose={() => setIsBastModalOpen(false)}
          branchName={bastBranch}
          items={items}
          preselectedIds={selectedIds}
        />
      )}
    </div>
  );
}
