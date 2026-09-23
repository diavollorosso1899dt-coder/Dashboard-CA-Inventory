'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Clock, 
  Search, 
  Calendar, 
  ShoppingBag, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  DollarSign, 
  Edit3, 
  Save, 
  X,
  FileCheck2,
  ImageIcon,
  Upload,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AssetRequest, RegionType } from '@/lib/supabase/types';
import ColumnVisibilityPicker, { ColumnItem, useColumnVisibility } from '@/components/ui/ColumnVisibilityPicker';
import { getItemImageUrl, setItemImageOverride } from '@/lib/assetImageHelper';
import { getItemSpecification } from '@/lib/assetSpecHelper';
import UploadImageModal from '@/components/items/UploadImageModal';

const PR_COLUMNS: ColumnItem[] = [
  { id: 'rab_branch', label: 'No. RAB & Cabang', defaultVisible: true, alwaysVisible: true },
  { id: 'item_name', label: 'Nama Item Aset', defaultVisible: true },
  { id: 'image', label: 'Gambar', defaultVisible: true },
  { id: 'qty', label: 'Qty PR', defaultVisible: true },
  { id: 'req_date', label: 'Tgl Permintaan', defaultVisible: true },
  { id: 'pr_po_date', label: 'Tgl PR & PO', defaultVisible: true },
  { id: 'vendor_deal', label: 'Vendor & Harga Deal', defaultVisible: true },
  { id: 'status', label: 'Status Pengadaan', defaultVisible: true },
  { id: 'actions', label: 'Aksi Tanggal', defaultVisible: true, alwaysVisible: true },
];

interface PurchaseRequirementViewProps {
  initialItems: AssetRequest[];
  region: RegionType;
}

export default function PurchaseRequirementView({ initialItems, region }: PurchaseRequirementViewProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'input' ? 'input' : 'monitoring';

  const [activeTab, setActiveTab] = useState<'input' | 'monitoring'>(initialTab);
  const [items, setItems] = useState<AssetRequest[]>(initialItems);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Client-side pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Image Preview & Upload Modal States
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [uploadModalTarget, setUploadModalTarget] = useState<{ itemName: string; currentImageUrl?: string | null } | null>(null);
  const [, setRefreshTicker] = useState(0);

  // Column Visibility
  const { visibleColumns, setVisibleColumns, isVisible } = useColumnVisibility(
    'ca_pr_columns',
    PR_COLUMNS
  );
  const visibleColCount = PR_COLUMNS.filter((c) => isVisible(c.id)).length;

  // Input Data Tanggal Permintaan State (Modal / Form Edit)
  const [editingItem, setEditingItem] = useState<AssetRequest | null>(null);
  const [editOrderDate, setEditOrderDate] = useState('');
  const [editPrDate, setEditPrDate] = useState('');
  const [editPoDate, setEditPoDate] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editStatus, setEditStatus] = useState<'belum' | 'proses' | 'po' | 'selesai'>('proses');
  const [editDealPrice, setEditDealPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const openEditModal = (item: AssetRequest) => {
    setEditingItem(item);
    setEditOrderDate(item.order_datetime ? item.order_datetime.split('T')[0] : '');
    setEditPrDate(item.pr_datetime ? item.pr_datetime.split('T')[0] : '');
    setEditPoDate(item.po_date || '');
    setEditVendor(item.vendor_name || '');
    setEditStatus(item.procurement_status || 'proses');
    setEditDealPrice(item.deal_price || item.rab_price || 0);
  };

  const handleSavePrDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setSaving(true);
    try {
      const payload = {
        order_datetime: editOrderDate ? new Date(editOrderDate).toISOString() : editingItem.order_datetime,
        pr_datetime: editPrDate ? new Date(editPrDate).toISOString() : null,
        po_date: editPoDate || null,
        vendor_name: editVendor,
        procurement_status: editStatus,
        deal_price: editDealPrice,
      };

      const res = await fetch(`/api/assets/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setItems((prev) =>
          prev.map((it) => (it.id === editingItem.id ? { ...it, ...payload } : it))
        );
        setEditingItem(null);
      } else {
        alert(json.error || 'Gagal menyimpan perubahan tanggal PR');
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((it) => {
    const q = search.toLowerCase();
    const matchSearch =
      it.item_name.toLowerCase().includes(q) ||
      it.branch_name.toLowerCase().includes(q) ||
      it.rab_number.toLowerCase().includes(q) ||
      (it.vendor_name && it.vendor_name.toLowerCase().includes(q));

    const matchStatus =
      statusFilter === 'ALL' || it.procurement_status === statusFilter;

    return matchSearch && matchStatus;
  });

  const totalCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / (pageSize === 0 ? totalCount || 1 : pageSize)));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = pageSize === 0 ? filteredItems : filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  // KPI Metrics
  const totalPrUnits = items.reduce((acc, it) => acc + (it.quantity_pr || it.quantity_needed || 0), 0);
  const totalPoCount = items.filter((it) => it.procurement_status === 'po' || it.po_date).length;
  const totalSelesaiCount = items.filter((it) => it.procurement_status === 'selesai').length;
  const totalProsesCount = items.filter((it) => it.procurement_status === 'proses').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Purchase Requirement (PR) Pengadaan Aset
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pelacakan alur permintaan pengadaan aset baru ke vendor luar, input tanggal permintaan, PO, dan SLA.
            </p>
          </div>
        </div>

        {/* Tab Buttons matching Mind Map */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('monitoring')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'monitoring'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Monitoring PR
          </button>
          <button
            onClick={() => setActiveTab('input')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'input'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Input Data Tanggal Permintaan
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Total Item PR</span>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{items.length}</div>
          <span className="text-[11px] text-slate-400">{totalPrUnits} unit barang</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Dalam Proses PR</span>
          <div className="text-2xl font-bold text-amber-600 mt-1">{totalProsesCount}</div>
          <span className="text-[11px] text-slate-400">Negosiasi vendor</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Sudah Terbit PO</span>
          <div className="text-2xl font-bold text-blue-600 mt-1">{totalPoCount}</div>
          <span className="text-[11px] text-slate-400">Menunggu pengiriman</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Selesai PR / Diterima</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{totalSelesaiCount}</div>
          <span className="text-[11px] text-slate-400">Lengkap</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari item, cabang, RAB, atau vendor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <ColumnVisibilityPicker
            columns={PR_COLUMNS}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
            storageKey="ca_pr_columns"
          />
          {['ALL', 'proses', 'po', 'selesai', 'belum'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold uppercase text-[11px] text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {isVisible('rab_branch') && <th className="py-3.5 px-4">No. RAB &amp; Cabang</th>}
                {isVisible('item_name') && <th className="py-3.5 px-4">Nama Item Aset</th>}
                {isVisible('image') && <th className="py-3.5 px-4 text-center">Gambar</th>}
                {isVisible('qty') && <th className="py-3.5 px-4">Qty PR</th>}
                {isVisible('req_date') && <th className="py-3.5 px-4">Tgl Permintaan</th>}
                {isVisible('pr_po_date') && <th className="py-3.5 px-4">Tgl PR &amp; PO</th>}
                {isVisible('vendor_deal') && <th className="py-3.5 px-4">Vendor &amp; Harga Deal</th>}
                {isVisible('status') && <th className="py-3.5 px-4">Status Pengadaan</th>}
                {isVisible('actions') && <th className="py-3.5 px-4 text-right">Aksi Tanggal</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-12 text-center text-slate-400">
                    Tidak ada data Purchase Requirement (PR) yang sesuai.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((it) => {
                  const reqDate = it.order_datetime ? new Date(it.order_datetime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
                  const prDate = it.pr_datetime ? new Date(it.pr_datetime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
                  const poDate = it.po_date ? new Date(it.po_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

                  return (
                    <tr key={it.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      {isVisible('rab_branch') && (
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-blue-600 dark:text-blue-400">{it.rab_number || '-'}</div>
                          <div className="text-[11px] text-slate-500">{it.branch_name} ({it.region})</div>
                        </td>
                      )}
                      {isVisible('item_name') && (
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">{it.item_name}</div>
                          <div className="text-[11px] text-slate-400">{it.classification}</div>
                        </td>
                      )}
                      {isVisible('image') && (
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex justify-center">
                            {(() => {
                              const imgUrl = getItemImageUrl(it.item_name);
                              return imgUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage({ url: imgUrl, title: it.item_name })}
                                  className="relative block w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden hover:ring-2 hover:ring-blue-500 hover:scale-105 transition-all shadow-2xs bg-white dark:bg-slate-800 shrink-0"
                                  title={`Klik perbesar: ${it.item_name}`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={imgUrl}
                                    alt={it.item_name}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setUploadModalTarget({ itemName: it.item_name, currentImageUrl: null })}
                                  className="w-10 h-10 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/80 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 text-[8px] shrink-0 transition group/upload"
                                  title={`Upload foto (maks 100 KB): ${it.item_name}`}
                                >
                                  <Upload className="h-3.5 w-3.5 mb-0.5 group-hover/upload:scale-110 transition-transform" />
                                  <span className="font-semibold text-[8px]">Upload</span>
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                      )}
                      {isVisible('qty') && (
                        <td className="py-3.5 px-4 font-bold">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                            {it.quantity_pr || it.quantity_needed} Unit
                          </span>
                        </td>
                      )}
                      {isVisible('req_date') && (
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {reqDate}
                        </td>
                      )}
                      {isVisible('pr_po_date') && (
                        <td className="py-3.5 px-4">
                          <div className="text-[11px]"><strong>PR:</strong> {prDate}</div>
                          <div className="text-[11px] text-slate-500"><strong>PO:</strong> {poDate}</div>
                        </td>
                      )}
                      {isVisible('vendor_deal') && (
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">{it.vendor_name || 'Belum Ditentukan'}</div>
                          <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                            Rp {(it.deal_price || it.rab_price || 0).toLocaleString('id-ID')}
                          </div>
                        </td>
                      )}
                      {isVisible('status') && (
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            it.procurement_status === 'selesai'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : it.procurement_status === 'po'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}>
                            {it.procurement_status === 'selesai' && <CheckCircle2 className="w-3 h-3" />}
                            {it.procurement_status === 'proses' && <Clock className="w-3 h-3 animate-pulse" />}
                            {it.procurement_status || 'proses'}
                          </span>
                        </td>
                      )}
                      {isVisible('actions') && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => openEditModal(it)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Update</span>
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

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={0}>Semua</option>
            </select>
            <span>
              Menampilkan {totalCount === 0 ? 0 : (safePage - 1) * (pageSize || totalCount) + 1} - {pageSize === 0 ? totalCount : Math.min(safePage * pageSize, totalCount)} dari {totalCount} data
            </span>
          </div>

          {pageSize > 0 && totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
                Halaman {safePage} dari {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                title="Halaman Selanjutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Input Tanggal Permintaan & PR */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Input / Perbarui Data Tanggal Permintaan Aset
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Item: <strong>{editingItem.item_name}</strong> &bull; {editingItem.branch_name}
                </p>
              </div>
              <button onClick={() => setEditingItem(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePrDates} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Permintaan Aset (Order Date)
                  </label>
                  <input
                    type="date"
                    value={editOrderDate}
                    onChange={(e) => setEditOrderDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal PR (Purchase Requirement)
                  </label>
                  <input
                    type="date"
                    value={editPrDate}
                    onChange={(e) => setEditPrDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal PO Vendor
                  </label>
                  <input
                    type="date"
                    value={editPoDate}
                    onChange={(e) => setEditPoDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Pengadaan
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="proses">Dalam Proses PR</option>
                    <option value="po">Sudah Terbit PO</option>
                    <option value="selesai">Selesai / Diterima</option>
                    <option value="belum">Belum Proses</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Vendor Terpilih
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Surya Kitchen Abadi"
                  value={editVendor}
                  onChange={(e) => setEditVendor(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Harga Deal / Realisasi (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={editDealPrice}
                  onChange={(e) => setEditDealPrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Tanggal & Data PR'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview Gambar & Spek */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="spring-pop panel-card relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <ImageIcon className="h-4 w-4 text-blue-600 shrink-0" />
                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {previewImage.title}
                </h4>
              </div>
              <button 
                onClick={() => setPreviewImage(null)} 
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-black/50 p-2 border border-slate-200 dark:border-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={previewImage.url} 
                alt={previewImage.title} 
                className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-xs" 
              />
            </div>

            {/* Rincian Spesifikasi Item */}
            {(() => {
              const spec = getItemSpecification(previewImage.title);
              return (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-750 text-xs space-y-1">
                  <span className="font-semibold text-amber-600 dark:text-amber-400 block">Rincian Spesifikasi:</span>
                  <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {spec || <span className="italic text-slate-400">Belum ada rincian spesifikasi untuk item ini.</span>}
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Master Aset
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    const target = { itemName: previewImage.title, currentImageUrl: previewImage.url };
                    setPreviewImage(null);
                    setUploadModalTarget(target);
                  }} 
                  className="px-3 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  <span>Ganti Foto (&le; 100KB)</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setPreviewImage(null)} 
                  className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload & Kompresi Foto Item */}
      {uploadModalTarget && (
        <UploadImageModal
          isOpen={true}
          onClose={() => setUploadModalTarget(null)}
          itemName={uploadModalTarget.itemName}
          currentImageUrl={uploadModalTarget.currentImageUrl}
          onUploadSuccess={(newItemName, newUrl) => {
            setItemImageOverride(newItemName, newUrl);
            setUploadModalTarget(null);
            setRefreshTicker((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
