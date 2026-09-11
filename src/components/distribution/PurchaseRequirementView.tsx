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
  FileCheck2
} from 'lucide-react';
import { AssetRequest, RegionType } from '@/lib/supabase/types';

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
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {['ALL', 'proses', 'po', 'selesai', 'belum'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
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
                <th className="py-3.5 px-4">No. RAB &amp; Cabang</th>
                <th className="py-3.5 px-4">Nama Item Aset</th>
                <th className="py-3.5 px-4">Qty PR</th>
                <th className="py-3.5 px-4">Tgl Permintaan</th>
                <th className="py-3.5 px-4">Tgl PR &amp; PO</th>
                <th className="py-3.5 px-4">Vendor &amp; Harga Deal</th>
                <th className="py-3.5 px-4">Status Pengadaan</th>
                <th className="py-3.5 px-4 text-right">Aksi Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada data Purchase Requirement (PR) yang sesuai.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it) => {
                  const reqDate = it.order_datetime ? new Date(it.order_datetime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
                  const prDate = it.pr_datetime ? new Date(it.pr_datetime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
                  const poDate = it.po_date ? new Date(it.po_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

                  return (
                    <tr key={it.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-blue-600 dark:text-blue-400">{it.rab_number || '-'}</div>
                        <div className="text-[11px] text-slate-500">{it.branch_name} ({it.region})</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{it.item_name}</div>
                        <div className="text-[11px] text-slate-400">{it.classification}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                          {it.quantity_pr || it.quantity_needed} Unit
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {reqDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-[11px]"><strong>PR:</strong> {prDate}</div>
                        <div className="text-[11px] text-slate-500"><strong>PO:</strong> {poDate}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900 dark:text-white">{it.vendor_name || 'Belum Ditentukan'}</div>
                        <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                          Rp {(it.deal_price || it.rab_price || 0).toLocaleString('id-ID')}
                        </div>
                      </td>
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
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openEditModal(it)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Update</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
    </div>
  );
}
