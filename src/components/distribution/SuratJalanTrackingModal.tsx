'use client';

import React from 'react';
import Link from 'next/link';
import { 
  X, 
  FileText, 
  Truck, 
  PackageCheck, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  MapPin, 
  User, 
  Printer, 
  Copy, 
  CheckCheck,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Boxes
} from 'lucide-react';
import { SuratJalan } from '@/lib/supabase/types';
import { formatDateOnly } from '@/lib/utils/date-formatter';
import { normalizeSjStatus } from './SuratJalanListView';

interface SuratJalanTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  suratJalan: SuratJalan | null;
  outletName?: string;
}

export default function SuratJalanTrackingModal({
  isOpen,
  onClose,
  suratJalan,
  outletName,
}: SuratJalanTrackingModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !suratJalan) return null;

  const targetOutlet = outletName || suratJalan.tujuan_outlet_nama || suratJalan.branch_name || 'Outlet Cabang';
  const sjNo = suratJalan.nomor_sj || suratJalan.sj_number || suratJalan.id;
  const roNo = suratJalan.ro_nomor || suratJalan.ro_number || '-';
  const normStatus = normalizeSjStatus(suratJalan.status);
  const isDelivered = normStatus === 'DELIVERED';
  const isCancelled = normStatus === 'CANCELLED';

  const driver = suratJalan.driver_nama || suratJalan.driver_name || suratJalan.expedition || 'Armada Internal SCGA';
  const plate = suratJalan.kendaraan_plat || suratJalan.vehicle_number || '-';
  const senderPic = suratJalan.pengirim_nama || suratJalan.sender_name || 'Staff Logistik SCGA';
  const receiverPic = suratJalan.penerima_nama || suratJalan.receiver_name;
  
  const createdDate = suratJalan.created_at ? new Date(suratJalan.created_at) : new Date();
  const deliveryDate = suratJalan.delivery_date || suratJalan.tanggal_kirim;
  const receivedDate = suratJalan.received_at || suratJalan.waktu_diterima;

  const items = suratJalan.items || [];
  const totalUnits = items.reduce((acc, it: any) => acc + Number(it.quantity ?? it.qty ?? 1), 0);

  const printUrl = `/distribution/surat-jalan/print/${encodeURIComponent(suratJalan.id)}?outlet=${encodeURIComponent(targetOutlet)}`;

  // Generate tracking text summary for copy
  const getTrackingSummaryText = () => {
    return [
      `📍 *TRACKING RIWAYAT SURAT JALAN: ${sjNo}*`,
      `• Outlet Tujuan: ${targetOutlet}`,
      `• Ref RO: ${roNo}`,
      `• Status Saat Ini: ${suratJalan.status}`,
      `-----------------------------------------`,
      `1. [DITERBITKAN] ${formatDateOnly(suratJalan.created_at || deliveryDate)} - Oleh: ${senderPic}`,
      `2. [ARMADA] ${driver} (${plate}) - Muat: ${items.length} item (${totalUnits} Unit)`,
      `3. [PENGIRIMAN] Tanggal Kirim: ${formatDateOnly(deliveryDate || suratJalan.created_at)}`,
      isDelivered 
        ? `4. [DITERIMA] ${formatDateOnly(receivedDate || deliveryDate)} - Oleh: ${receiverPic || 'PIC Cabang'}` 
        : `4. [DITERIMA] Menunggu konfirmasi kedatangan di outlet.`,
      `-----------------------------------------`,
      `Dicatat oleh Sistem Distribusi SCGA`,
    ].join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getTrackingSummaryText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="spring-pop panel-card w-full max-w-2xl max-h-[90vh] flex flex-col p-5 sm:p-6 border border-[#e0e2ec] dark:border-[#444746] rounded-2xl bg-white dark:bg-[#1e1f20] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 shadow-xs">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {sjNo}
                </span>
                {isDelivered ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Selesai &amp; Tiba
                  </span>
                ) : isCancelled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    Dibatalkan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <Clock className="h-3 w-3 animate-spin" /> Dalam Pengiriman
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                Riwayat Penerbitan &amp; Tracking Surat Jalan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tujuan: <strong className="text-slate-800 dark:text-slate-200">{targetOutlet}</strong> • Ref RO: <strong className="font-mono text-slate-800 dark:text-slate-200">{roNo}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Content */}
        <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-6">
          
          {/* Visual Progress Stepper Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Alur Pelacakan Distribusi Resmi</span>
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Total Muatan: {totalUnits} Unit ({items.length} Jenis Item)
              </span>
            </div>

            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
              
              {/* TAHAP 1: PENERBITAN SURAT JALAN */}
              <div className="relative">
                <div className="absolute -left-6 sm:-left-8 top-0 flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="bg-white dark:bg-[#1e1f20] p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      Tahap 1: Surat Jalan Resmi Diterbitkan
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {formatDateOnly(suratJalan.created_at || deliveryDate)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Diterbitkan Oleh:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{senderPic}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Asal Lokasi:</span>
                      <strong className="text-slate-800 dark:text-slate-200">Gudang Pusat SCGA</strong>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    Dokumen #{sjNo} resmi dibuat dan dialokasikan untuk distribusi aset cabang {targetOutlet}.
                  </div>
                </div>
              </div>

              {/* TAHAP 2: PENETAPAN ARMADA & DRIVER */}
              <div className="relative">
                <div className="absolute -left-6 sm:-left-8 top-0 flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="bg-white dark:bg-[#1e1f20] p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Tahap 2: Muat Armada &amp; Serah Terima Kurir
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      Plat: {plate}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Kurir / Driver Pengantar:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{driver}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Ekspedisi:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{suratJalan.expedition || 'Armada Internal SCGA'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* TAHAP 3: DALAM PERJALANAN (IN TRANSIT) */}
              <div className="relative">
                <div className={`absolute -left-6 sm:-left-8 top-0 flex items-center justify-center w-6 h-6 rounded-full ${
                  isDelivered ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white animate-pulse'
                } shadow-xs`}>
                  {isDelivered ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-3.5 h-3.5" />}
                </div>
                <div className={`p-3.5 rounded-xl border shadow-2xs ${
                  isDelivered 
                    ? 'bg-white dark:bg-[#1e1f20] border-slate-200 dark:border-slate-800' 
                    : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
                }`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${
                      isDelivered ? 'text-slate-900 dark:text-white' : 'text-amber-800 dark:text-amber-300'
                    }`}>
                      <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      Tahap 3: Pengiriman ke Cabang Tujuan
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      Kirim: {formatDateOnly(deliveryDate || suratJalan.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Gudang Pusat SCGA</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{targetOutlet}</span>
                  </div>
                  {!isDelivered && (
                    <div className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/60 dark:bg-amber-950/40 p-2 rounded-lg">
                      Armada sedang dalam perjalanan menuju outlet cabang. Menunggu konfirmasi penerimaan fisik di cabang.
                    </div>
                  )}
                </div>
              </div>

              {/* TAHAP 4: TIBA & DITERIMA OUTLET (SERAH TERIMA & TTD) */}
              <div className="relative">
                <div className={`absolute -left-6 sm:-left-8 top-0 flex items-center justify-center w-6 h-6 rounded-full ${
                  isDelivered 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                } shadow-xs`}>
                  {isDelivered ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-3.5 h-3.5" />}
                </div>
                <div className={`p-3.5 rounded-xl border shadow-2xs ${
                  isDelivered 
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/80' 
                    : 'bg-slate-50 dark:bg-slate-800/20 border-dashed border-slate-300 dark:border-slate-700'
                }`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${
                      isDelivered ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      <PackageCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Tahap 4: Konfirmasi Penerimaan &amp; BAST Cabang
                    </span>
                    {receivedDate && (
                      <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                        Tiba: {formatDateOnly(receivedDate)}
                      </span>
                    )}
                  </div>

                  {isDelivered ? (
                    <div className="mt-2 space-y-3">
                      <div className="text-xs text-slate-700 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block text-[11px]">PIC Penerima Cabang:</span>
                          <strong className="text-emerald-700 dark:text-emerald-300">{receiverPic || 'PIC Outlet'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">Waktu Tiba Resmi:</span>
                          <strong className="font-mono text-slate-800 dark:text-slate-200">{formatDateOnly(receivedDate || deliveryDate)}</strong>
                        </div>
                      </div>

                      {suratJalan.catatan_penerimaan && (
                        <div className="text-xs bg-white dark:bg-[#1e1f20] p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-slate-700 dark:text-slate-300">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300 block text-[11px]">Catatan Kondisi Barang:</span>
                          {suratJalan.catatan_penerimaan}
                        </div>
                      )}

                      {/* Bukti Foto & TTD */}
                      {(suratJalan.tanda_tangan_url || suratJalan.foto_bukti_url) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {suratJalan.tanda_tangan_url && (
                            <div className="bg-white dark:bg-[#1e1f20] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] font-bold text-slate-400 block mb-1">Tanda Tangan Penerima</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={suratJalan.tanda_tangan_url} 
                                alt="TTD Penerima" 
                                className="h-16 max-w-full object-contain mx-auto"
                              />
                            </div>
                          )}
                          {suratJalan.foto_bukti_url && (
                            <div className="bg-white dark:bg-[#1e1f20] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[10px] font-bold text-slate-400 block mb-1">Foto Bukti Kedatangan</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={suratJalan.foto_bukti_url} 
                                alt="Bukti Kedatangan" 
                                className="h-16 w-full object-cover rounded"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-500 italic">
                      Menunggu barang tiba di cabang. Cabang belum mengunggah konfirmasi tanda tangan digital &amp; foto fisik.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Rincian Item yang Diterbitkan */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Daftar Aset yang Diterbitkan ({items.length} Item, {totalUnits} Unit)
              </span>
              <span className="text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                SJ #{sjNo}
              </span>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 px-3 w-8 text-center">#</th>
                  <th className="py-2 px-3">Nama Barang</th>
                  <th className="py-2 px-3 text-center w-24">Jumlah</th>
                  <th className="py-2 px-3">Spesifikasi / Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length > 0 ? (
                  items.map((it: any, idx: number) => {
                    const itemName = it.item_name || it.nama_barang || it.name || 'Barang';
                    const qty = it.quantity ?? it.qty ?? 1;
                    const unit = it.unit || it.satuan || 'UNIT';
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                          {itemName}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {qty} {unit}
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px] italic">
                          {it.notes || it.specification || '-'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 italic">
                      Tidak ada rincian item dalam dokumen ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1f20] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shadow-2xs"
          >
            {copied ? (
              <>
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 dark:text-emerald-300 font-bold">Ringkasan Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Info Tracking</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <Link
              href={printUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Surat Jalan</span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
