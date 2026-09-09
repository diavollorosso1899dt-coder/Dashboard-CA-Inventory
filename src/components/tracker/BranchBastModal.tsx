'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  X, 
  FileText, 
  Store, 
  CheckSquare, 
  Square,
  ListFilter,
  Plus,
  Trash2
} from 'lucide-react';
import { AssetRequest } from '@/lib/supabase/types';

interface BranchBastModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchName: string;
  items: AssetRequest[];
  preselectedIds?: string[];
}

export function BranchBastModal({ 
  isOpen, 
  onClose, 
  branchName: initialBranch, 
  items,
  preselectedIds = []
}: BranchBastModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(initialBranch);
  const [isManagingItems, setIsManagingItems] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Extract all unique branches available in the data
  const uniqueBranches = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.branch_name && i.branch_name !== 'Tanpa Nama Outlet') {
        set.add(i.branch_name);
      }
    });
    return Array.from(set).sort();
  }, [items]);

  const activeBranch = selectedBranch || uniqueBranches[0] || initialBranch;
  
  const branchItems = useMemo(() => {
    return items.filter((i) => i.branch_name === activeBranch);
  }, [items, activeBranch]);

  // Checked items state for partial / selected shipment BAST
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  // Initialize checked items when branch or preselectedIds change
  useEffect(() => {
    const branchItemIds = branchItems.map((i) => i.id || i.external_id);
    if (preselectedIds.length > 0) {
      const matched = preselectedIds.filter((id) => branchItemIds.includes(id));
      setCheckedIds(matched.length > 0 ? matched : branchItemIds);
    } else {
      setCheckedIds(branchItemIds);
    }
  }, [branchItems, preselectedIds]);

  const isAllSelected = useMemo(() => {
    if (branchItems.length === 0) return false;
    return branchItems.every((i) => checkedIds.includes(i.id || i.external_id));
  }, [branchItems, checkedIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setCheckedIds([]);
    } else {
      setCheckedIds(branchItems.map((i) => i.id || i.external_id));
    }
  };

  const handleToggleItem = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleRemoveItem = (id: string) => {
    setCheckedIds((prev) => prev.filter((i) => i !== id));
  };

  // Filter items to ONLY those checked
  const printableItems = useMemo(() => {
    return branchItems.filter((i) => checkedIds.includes(i.id || i.external_id));
  }, [branchItems, checkedIds]);

  if (!isOpen || !mounted) return null;

  const totalQtyNeeded = printableItems.reduce((acc, curr) => acc + (curr.quantity_needed || 0), 0);
  const completedCount = printableItems.filter((i) => (i.item_delivery_status || '').toLowerCase().includes('lengkap')).length;
  const currentDateFormatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const handlePrint = () => {
    if (printableItems.length === 0) {
      alert('Pilih minimal 1 item untuk dicetak dalam dokumen BAST.');
      return;
    }
    window.print();
  };

  const modalContent = (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="bast-modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-3 sm:p-6 print:p-0 print:bg-white print:static print:inset-auto animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      {/* Modal Container with strict max-h to prevent viewport drowning */}
      <div className="bast-modal-card relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden print:border-none print:bg-white print:text-black print:shadow-none print:w-full print:max-w-none print:max-h-none print:overflow-visible transition-all">
        
        {/* 1. Sticky Top Action Header (Always visible on screen, hidden on print) */}
        <div className="sticky top-0 z-30 flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-3.5 print:hidden shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c2e7ff] dark:bg-[#004a77] text-[#001d35] dark:text-[#c2e7ff]">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Cetak BAST &amp; Surat Jalan (Item Pilihan)
              </h2>
              <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
                Hanya menampilkan item terpilih untuk pengiriman hari ini
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Branch Selector Dropdown */}
            <div className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-3 py-1 text-xs shadow-xs">
              <Store className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <select
                value={activeBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setIsManagingItems(false);
                }}
                className="bg-transparent text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none cursor-pointer max-w-[150px] sm:max-w-[220px] truncate"
              >
                {uniqueBranches.map((b) => (
                  <option key={b} value={b} className="bg-white dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handlePrint}
              disabled={printableItems.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-1.5 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak ({printableItems.length})</span>
            </button>

            {/* Prominent Close Button */}
            <button
              onClick={onClose}
              className="rounded-full p-2 text-[#747775] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] hover:text-[#1f1f1f] dark:hover:text-white transition-colors cursor-pointer"
              title="Tutup (ESC)"
              aria-label="Tutup dialog BAST"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 2. Sticky Selection & Filter Strip (Hidden on Print) */}
        <div className="sticky top-[65px] z-20 flex-shrink-0 flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#e8f0fe] dark:bg-[#003355] px-6 py-2.5 text-xs print:hidden shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold">
              Menampilkan <strong className="text-[#0b57d0] dark:text-[#a8c7fa]">{printableItems.length}</strong> dari {branchItems.length} item cabang
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsManagingItems(!isManagingItems)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors cursor-pointer border ${
                isManagingItems
                  ? 'bg-[#0b57d0] text-white border-[#0b57d0]'
                  : 'bg-white dark:bg-[#1e1f20] text-[#0b57d0] dark:text-[#a8c7fa] border-[#e0e2ec] dark:border-[#444746] hover:bg-[#f0f4f9]'
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>{isManagingItems ? 'Sembunyikan Pemilih' : 'Kelola / Tambah Item'}</span>
            </button>
          </div>
        </div>

        {/* 2.1 Expandable Item Picker Drawer (When user clicks 'Kelola / Tambah Item') */}
        {isManagingItems && (
          <div className="border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#202124] p-4 max-h-56 overflow-y-auto print:hidden animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Centang item yang ingin dimasukkan ke BAST:
              </span>
              <button
                onClick={handleToggleSelectAll}
                className="text-xs font-semibold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline cursor-pointer"
              >
                {isAllSelected ? 'Batalkan Semua' : 'Pilih Semua Item'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {branchItems.map((item) => {
                const itemId = item.id || item.external_id;
                const isChecked = checkedIds.includes(itemId);

                return (
                  <label
                    key={itemId}
                    onClick={() => handleToggleItem(itemId)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[#e8f0fe] dark:bg-[#004a77]/40 border-[#0b57d0]/40 text-[#001d35] dark:text-[#c2e7ff] font-semibold'
                        : 'bg-white dark:bg-[#1e1f20] border-[#e0e2ec] dark:border-[#444746] text-[#444746] dark:text-[#c4c7c5]'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa] flex-shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-[#747775] flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{item.item_name}</span>
                    <span className="text-[11px] opacity-75">({item.quantity_needed} unit)</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Scrollable Printable Document Body (A4 standard format) */}
        <div 
          id="bast-printable-area" 
          className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 print:p-0 print:space-y-4 print:overflow-visible print:max-h-none text-[#1f1f1f] dark:text-[#e3e3e3] print:text-black bg-[#ffffff] dark:bg-[#1e1f20] print:bg-white"
        >
          
          {/* Document Letterhead */}
          <div className="border-b-2 border-[#1f1f1f] print:border-black pb-4 text-center">
            <h1 className="text-lg md:text-xl font-bold uppercase tracking-wider text-[#1f1f1f] dark:text-white print:text-black">
              BERITA ACARA SERAH TERIMA &amp; SURAT JALAN ASET
            </h1>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] print:text-gray-600 mt-1">
              Divisi Asset Control &amp; Inventory Management — PT Soul Cool Gastro Agronesia (SCGA)
            </p>
          </div>

          {/* Metadata Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] print:border-gray-300 p-3.5 bg-[#f0f4f9] dark:bg-[#282a2c] print:bg-white">
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Nama Cabang / Outlet:</span>
                <span className="font-bold text-[#1f1f1f] dark:text-white print:text-black">{activeBranch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Wilayah Operasional:</span>
                <span className="font-medium text-[#1f1f1f] dark:text-slate-200 print:text-black">{branchItems[0]?.region || 'JABODETABEK'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Nomor RAB Terkait:</span>
                <span className="font-mono text-[#1f1f1f] dark:text-slate-300 print:text-black">{branchItems[0]?.rab_number || '-'}</span>
              </div>
            </div>

            <div className="space-y-1.5 rounded-2xl border border-[#e0e2ec] dark:border-[#444746] print:border-gray-300 p-3.5 bg-[#f0f4f9] dark:bg-[#282a2c] print:bg-white">
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Tanggal Dokumen:</span>
                <span className="font-semibold text-[#1f1f1f] dark:text-slate-200 print:text-black">{currentDateFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Total Item Terkirim:</span>
                <span className="font-bold text-[#137333] dark:text-[#6dd58c] print:text-black">{printableItems.length} Item ({totalQtyNeeded} Unit)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-500">Status Kelengkapan:</span>
                <span className="font-semibold text-[#137333] dark:text-[#6dd58c] print:text-black">{completedCount} dari {printableItems.length} Selesai ({printableItems.length > 0 ? Math.round((completedCount / printableItems.length) * 100) : 0}%)</span>
              </div>
            </div>
          </div>

          {/* Items Table: ONLY SHOWS CHECKED ITEMS */}
          <div className="overflow-hidden rounded-2xl border border-[#e0e2ec] dark:border-[#444746] print:border-black">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e0e2ec] dark:border-[#444746] print:border-black bg-[#f0f4f9] dark:bg-[#282a2c] print:bg-gray-100 text-[#444746] dark:text-[#c4c7c5] print:text-black font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">No</th>
                  <th className="py-2.5 px-3">Nama Item Diajukan</th>
                  <th className="py-2.5 px-3">Spesifikasi / Detail</th>
                  <th className="py-2.5 px-3 text-center">Qty Dikirim</th>
                  <th className="py-2.5 px-3 text-center">Stok SCGA</th>
                  <th className="py-2.5 px-3 text-center">Status Barang</th>
                  <th className="py-2.5 px-3">Catatan / Cek Fisik</th>
                  <th className="py-2.5 px-3 w-10 text-center print:hidden">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746] print:divide-gray-300">
                {printableItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[#747775]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="font-semibold text-sm">Tidak ada item yang dipilih untuk dicetak.</p>
                        <button
                          onClick={() => setIsManagingItems(true)}
                          className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0842a0] transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Pilih Item Cabang Ini
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  printableItems.map((item, idx) => {
                    const itemId = item.id || item.external_id;

                    return (
                      <tr 
                        key={itemId} 
                        className="hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] print:hover:bg-transparent transition-colors"
                      >
                        <td className="py-2 px-3 text-center font-mono text-[#747775] print:text-black">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#1f1f1f] dark:text-white print:text-black">
                          {item.item_name}
                        </td>
                        <td className="py-2 px-3 text-[#444746] dark:text-[#c4c7c5] print:text-gray-700 text-[11px] max-w-[200px] truncate">
                          {item.specification || '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-[#1f1f1f] dark:text-white print:text-black">
                          {item.quantity_needed}
                        </td>
                        <td className="py-2 px-3 text-center font-semibold text-[#137333] dark:text-[#6dd58c] print:text-black">
                          {item.quantity_stock_allocated || 0}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#e0e2ec] dark:border-[#444746] print:border-black print:text-black">
                            {item.item_delivery_status || 'On Proses'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#747775] dark:text-[#8e918f] print:text-black text-[11px]">
                          {item.notes || 'Baik / Sesuai'}
                        </td>
                        <td className="py-2 px-3 text-center print:hidden">
                          <button
                            onClick={() => handleRemoveItem(itemId)}
                            className="p-1 rounded-full text-[#747775] hover:text-[#b3261e] hover:bg-[#fce8e6] dark:hover:bg-[#601410] transition-colors cursor-pointer"
                            title="Hapus dari cetakan BAST"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Statement & Signatures */}
          <div className="space-y-3 pt-2 text-xs">
            <p className="text-[#444746] dark:text-[#c4c7c5] print:text-gray-700 leading-relaxed text-[11px]">
              Demikian Berita Acara Serah Terima (BAST) ini dibuat dengan sebenarnya dalam rangkap secukupnya untuk dipergunakan sebagaimana mestinya. Seluruh barang yang tercantum di atas telah diperiksa kondisi fisik, kelengkapan, dan kesesuaian fungsinya.
            </p>

            <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs">
              <div className="space-y-16 border-t border-[#e0e2ec] dark:border-[#444746] print:border-black pt-2">
                <p className="font-semibold text-[#1f1f1f] dark:text-slate-300 print:text-black">Diserahkan Oleh (Pihak I):</p>
                <div className="space-y-0.5">
                  <p className="font-bold text-[#1f1f1f] dark:text-white print:text-black underline">Tim Asset Control &amp; Logistik</p>
                  <p className="text-[10px] text-[#747775] dark:text-slate-400 print:text-gray-600">Head Office SCGA</p>
                </div>
              </div>

              <div className="space-y-16 border-t border-[#e0e2ec] dark:border-[#444746] print:border-black pt-2">
                <p className="font-semibold text-[#1f1f1f] dark:text-slate-300 print:text-black">Diterima Oleh (Pihak II):</p>
                <div className="space-y-0.5">
                  <p className="font-bold text-[#1f1f1f] dark:text-white print:text-black underline">{branchItems[0]?.pic_receiver || '(................................................)'}</p>
                  <p className="text-[10px] text-[#747775] dark:text-slate-400 print:text-gray-600">Store Manager / PIC Outlet</p>
                </div>
              </div>

              <div className="space-y-16 border-t border-[#e0e2ec] dark:border-[#444746] print:border-black pt-2">
                <p className="font-semibold text-[#1f1f1f] dark:text-slate-300 print:text-black">Mengetahui &amp; Menyetujui:</p>
                <div className="space-y-0.5">
                  <p className="font-bold text-[#1f1f1f] dark:text-white print:text-black underline">Kadiv Pengadaan / BusDev</p>
                  <p className="text-[10px] text-[#747775] dark:text-slate-400 print:text-gray-600">Head of Operations</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 4. Sticky Bottom Action Footer (Always visible on screen, hidden on print) */}
        <div className="sticky bottom-0 z-30 flex-shrink-0 flex items-center justify-between border-t border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-3 print:hidden">
          <span className="text-xs text-[#444746] dark:text-[#c4c7c5]">
            Item yang akan dicetak: <strong className="text-[#0b57d0] dark:text-[#a8c7fa]">{printableItems.length} Item</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-4 py-1.5 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={handlePrint}
              disabled={printableItems.length === 0}
              className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-1.5 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Cetak Dokumen BAST ({printableItems.length})</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
