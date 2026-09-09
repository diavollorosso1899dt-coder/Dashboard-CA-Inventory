'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  ExternalLink, 
  Clock, 
  User, 
  Store, 
  FileText, 
  CheckCircle2 
} from 'lucide-react';
import { AssetRequest } from '@/lib/supabase/types';
import { formatDateTime, formatDateOnly, formatIDR, formatLeadTime } from '@/lib/utils/date-formatter';

interface AssetDetailModalProps {
  item: AssetRequest;
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: (updated: AssetRequest) => void;
}

export function AssetDetailModal({
  item,
  isOpen,
  onClose,
  onSaveSuccess,
}: AssetDetailModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState(item.item_delivery_status || 'On Proses');
  const [stockStatus, setStockStatus] = useState(item.stock_status || 'Not Ready (Stok Kosong)');
  const [picReceiver, setPicReceiver] = useState(item.pic_receiver || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [receivedDate, setReceivedDate] = useState(
    item.received_date ? item.received_date.split('T')[0] : ''
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setDeliveryStatus(item.item_delivery_status || 'On Proses');
    setStockStatus(item.stock_status || 'Not Ready (Stok Kosong)');
    setPicReceiver(item.pic_receiver || '');
    setNotes(item.notes || '');
    setReceivedDate(item.received_date ? item.received_date.split('T')[0] : '');
    setSaveMessage(null);
  }, [item]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);

      const payload: Partial<AssetRequest> = {
        item_delivery_status: deliveryStatus,
        stock_status: stockStatus,
        pic_receiver: picReceiver,
        notes: notes,
        received_date: receivedDate ? new Date(receivedDate).toISOString() : null,
      };

      const res = await fetch(`/api/assets/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSaveMessage('Data berhasil diperbarui ke Supabase.');
        onSaveSuccess(json.data || { ...item, ...payload, is_manually_edited: true });
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setSaveMessage(`Gagal: ${json.error || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      setSaveMessage(`Gagal: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-item-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl flex flex-col rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] shadow-2xl overflow-hidden transition-all">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 flex-shrink-0 flex items-start justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#c2e7ff] dark:bg-[#004a77] px-2.5 py-0.5 text-[11px] font-semibold text-[#001d35] dark:text-[#c2e7ff]">
                {item.region}
              </span>
              <span className="text-xs font-mono text-[#747775] dark:text-[#8e918f]">
                ID: {item.external_id}
              </span>
            </div>
            <h2 id="modal-item-title" className="mt-1 text-base sm:text-lg font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              {item.item_name}
            </h2>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
              Cabang: <strong className="text-[#1f1f1f] dark:text-[#e3e3e3]">{item.branch_name}</strong> • Kategori: {item.category}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-[#747775] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] hover:text-[#1f1f1f] dark:hover:text-white transition-colors cursor-pointer"
            title="Tutup (ESC)"
            aria-label="Tutup dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
          {/* Key Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746]/60">
            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Waktu Order Pengajuan:</span>
              <div className="flex items-center gap-1 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                <Clock className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
                {formatDateTime(item.order_datetime)}
              </div>
            </div>

            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Pengaju dan Divisi:</span>
              <div className="flex items-center gap-1 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                <User className="h-3.5 w-3.5 text-[#137333] dark:text-[#6dd58c]" />
                {item.requester_name} ({item.requester_division || 'BusDev'})
              </div>
            </div>

            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Nomor Dokumen RAB:</span>
              <div className="flex items-center gap-1 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                <FileText className="h-3.5 w-3.5 text-[#b06000] dark:text-[#ffb951]" />
                {item.rab_number || '-'}
                {item.rab_link && (
                  <a
                    href={item.rab_link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0b57d0] dark:text-[#a8c7fa] hover:underline inline-flex items-center gap-0.5 ml-1 font-semibold"
                  >
                    <ExternalLink className="h-3 w-3" /> Dokumen
                  </a>
                )}
              </div>
            </div>

            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Target Opening Outlet:</span>
              <div className="flex items-center gap-1 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] mt-0.5">
                <Store className="h-3.5 w-3.5 text-[#747775] dark:text-[#8e918f]" />
                {formatDateOnly(item.opening_date)}
              </div>
            </div>

            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Klasifikasi &amp; Volume:</span>
              <div className="text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold mt-0.5">
                {item.classification} • {item.quantity_needed} Unit (Stok: {item.quantity_stock_allocated}, PR: {item.quantity_pr})
              </div>
            </div>

            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Durasi Pengadaan (SLA):</span>
              <div className="text-[#1f1f1f] dark:text-[#e3e3e3] font-semibold mt-0.5">
                {formatLeadTime(item.lead_time_days)}
              </div>
            </div>
          </div>

          {/* Spesifikasi Item */}
          {item.specification && (
            <div>
              <label className="block font-bold uppercase text-[10px] text-[#747775] dark:text-[#8e918f] mb-1">
                Spesifikasi Item
              </label>
              <p className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-3 text-[#1f1f1f] dark:text-[#e3e3e3] border border-[#e0e2ec] dark:border-[#444746]/60 whitespace-pre-line leading-relaxed">
                {item.specification}
              </p>
            </div>
          )}

          {/* Pengadaan & Vendor Info */}
          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746]/60 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Nama Vendor:</span>
              <p className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{item.vendor_name || '-'}</p>
            </div>
            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Harga Deal per Unit:</span>
              <p className="font-bold text-[#137333] dark:text-[#6dd58c]">{formatIDR(item.deal_price)}</p>
            </div>
            <div>
              <span className="text-[#747775] dark:text-[#8e918f]">Total Biaya RAB:</span>
              <p className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">{formatIDR(item.rab_total)}</p>
            </div>
          </div>

          {/* Edit Form */}
          <div className="border-t border-[#e0e2ec] dark:border-[#444746] pt-3">
            <h3 className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-sm mb-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#137333] dark:text-[#6dd58c]" />
              Perbarui Status dan Catatan
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Status Pengiriman Barang
                </label>
                <select
                  value={deliveryStatus}
                  onChange={(e) => setDeliveryStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="Lengkap">Lengkap</option>
                  <option value="Lengkap (SCGA)">Lengkap (SCGA)</option>
                  <option value="Lengkap (Lokasi)">Lengkap (Lokasi)</option>
                  <option value="Diterima Sebagian">Diterima Sebagian</option>
                  <option value="Diterima Sebagian (Lokasi)">Diterima Sebagian (Lokasi)</option>
                  <option value="On Proses">On Proses</option>
                  <option value="On Proses (SCGA)">On Proses (SCGA)</option>
                  <option value="On Proses (Lokasi)">On Proses (Lokasi)</option>
                  <option value="Ready Gudang SCGA">Ready Gudang SCGA</option>
                  <option value="Belum Proses">Belum Proses</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Status Stok Gudang SCGA
                </label>
                <select
                  value={stockStatus}
                  onChange={(e) => setStockStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="Ready (Spek Sesuai)">Ready (Spek Sesuai)</option>
                  <option value="Ready (Spek Berbeda)">Ready (Spek Berbeda)</option>
                  <option value="Not Ready (Stok Kosong)">Not Ready (Stok Kosong)</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  PIC Penerima Barang di Lokasi
                </label>
                <input
                  type="text"
                  placeholder="Nama PIC Penerima (misal: Rian SM)"
                  value={picReceiver}
                  onChange={(e) => setPicReceiver(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Tanggal Terima Barang
                </label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-semibold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Catatan Tambahan &amp; Kendala Lapangan
                </label>
                <textarea
                  rows={2}
                  placeholder="Tambahkan catatan khusus, nomor resi pengiriman, atau kendala barang..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] placeholder-[#747775] dark:placeholder-[#8e918f] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Feedback Message */}
          {saveMessage && (
            <div
              className={`rounded-2xl p-3 text-xs font-semibold ${
                saveMessage.includes('berhasil')
                  ? 'bg-[#e6f4ea] dark:bg-[#0f5223] text-[#137333] dark:text-[#6dd58c] border border-[#ceead6]'
                  : 'bg-[#fce8e6] dark:bg-[#601410] text-[#b3261e] dark:text-[#f2b8b5] border border-[#f9dedc]'
              }`}
            >
              {saveMessage}
            </div>
          )}
        </div>

        {/* Sticky Footer Actions */}
        <div className="sticky bottom-0 z-20 flex-shrink-0 flex items-center justify-end gap-2.5 border-t border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#282a2c] px-6 py-3.5">
          <button
            onClick={onClose}
            className="rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-4 py-1.5 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-1.5 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
