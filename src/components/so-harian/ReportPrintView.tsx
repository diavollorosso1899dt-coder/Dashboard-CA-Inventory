'use client';

import React from 'react';
import { SOItem } from '@/lib/so-harian/inventoryEngine';
import { SOSession } from '@/lib/so-harian/storageService';

interface ReportPrintViewProps {
  session?: Partial<SOSession>;
  items?: SOItem[];
  isPrinting?: boolean;
}

export default function ReportPrintView({ session = {}, items = [], isPrinting = false }: ReportPrintViewProps) {
  // Never render 7,000 table rows into DOM when not actively printing
  if (!isPrinting) return null;

  let matchCount = 0;
  let minusCount = 0;
  let plusCount = 0;

  for (let i = 0; i < items.length; i++) {
    const s = items[i].status_selisih;
    if (s === 'MATCH') matchCount++;
    else if (s === 'MINUS') minusCount++;
    else if (s === 'PLUS') plusCount++;
  }

  const akurasi = items.length > 0 ? Math.round((matchCount / items.length) * 10000) / 100 : 0;

  return (
    <div className="p-8 bg-white text-black font-sans text-xs">
      {/* Official Document Header */}
      <div className="border-b-2 border-black pb-4 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight uppercase">BERITA ACARA &amp; LAPORAN SO HARIAN</h1>
          <p className="text-xs text-slate-600">Dokumen Rekonsiliasi Fisik vs Stok Sistem Gudang</p>
        </div>
        <div className="text-right text-xs">
          <p><strong>Tanggal SO:</strong> {session.tanggal || new Date().toISOString().split('T')[0]}</p>
          <p><strong>Gudang:</strong> {session.gudang || 'Gudang Utama'}</p>
          <p><strong>Waktu Cetak:</strong> {new Date().toLocaleString('id-ID')}</p>
        </div>
      </div>

      {/* Summary Box */}
      <div className="grid grid-cols-4 gap-3 p-3 bg-slate-100 rounded-lg mb-4 text-center border border-slate-300">
        <div>
          <span className="block text-slate-500 font-semibold text-[10px]">TOTAL SKU</span>
          <span className="text-base font-bold">{items.length}</span>
        </div>
        <div>
          <span className="block text-emerald-700 font-semibold text-[10px]">MATCH (COCOK)</span>
          <span className="text-base font-bold text-emerald-800">{matchCount}</span>
        </div>
        <div>
          <span className="block text-rose-700 font-semibold text-[10px]">SELISIH (MINUS / PLUS)</span>
          <span className="text-base font-bold text-rose-800">{minusCount + plusCount}</span>
        </div>
        <div>
          <span className="block text-slate-700 font-semibold text-[10px]">AKURASI STOK (%)</span>
          <span className="text-base font-bold text-indigo-900">{akurasi}%</span>
        </div>
      </div>

      {/* Detail Table */}
      <table className="w-full border-collapse border border-black text-[11px] mb-8">
        <thead>
          <tr className="bg-slate-200 border-b border-black">
            <th className="border border-black p-1.5 w-8 text-center">No</th>
            <th className="border border-black p-1.5 text-left">Kode Barang</th>
            <th className="border border-black p-1.5 text-left">Nama Barang</th>
            <th className="border border-black p-1.5 text-center">Kategori</th>
            <th className="border border-black p-1.5 text-center">Sat</th>
            <th className="border border-black p-1.5 text-right">Awal</th>
            <th className="border border-black p-1.5 text-right">Masuk</th>
            <th className="border border-black p-1.5 text-right">RO</th>
            <th className="border border-black p-1.5 text-right font-bold">Sistem</th>
            <th className="border border-black p-1.5 text-right font-bold">Fisik</th>
            <th className="border border-black p-1.5 text-right font-bold">Selisih</th>
            <th className="border border-black p-1.5 text-center">Status</th>
            <th className="border border-black p-1.5 text-left">Catatan / Alasan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b border-slate-300">
              <td className="border border-black p-1 text-center">{idx + 1}</td>
              <td className="border border-black p-1 font-mono font-bold">{item.kode_barang}</td>
              <td className="border border-black p-1">{item.nama_barang}</td>
              <td className="border border-black p-1 text-center font-semibold">{item.kategori || 'Peralatan'}</td>
              <td className="border border-black p-1 text-center">{item.satuan}</td>
              <td className="border border-black p-1 text-right">{item.stok_awal}</td>
              <td className="border border-black p-1 text-right">+{item.qty_penerimaan}</td>
              <td className="border border-black p-1 text-right">-{item.qty_ro}</td>
              <td className="border border-black p-1 text-right font-bold">{item.stok_sistem}</td>
              <td className="border border-black p-1 text-right font-bold">{item.qty_fisik ?? '-'}</td>
              <td className="border border-black p-1 text-right font-bold">
                {item.selisih !== null ? (item.selisih > 0 ? `+${item.selisih}` : item.selisih) : '-'}
              </td>
              <td className="border border-black p-1 text-center font-bold">
                {item.status_selisih}
              </td>
              <td className="border border-black p-1 text-slate-700 italic">{item.catatan || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature Section */}
      <div className="grid grid-cols-3 gap-6 text-center pt-6">
        <div>
          <p className="font-semibold mb-16">Petugas Checker Fisik</p>
          <div className="border-b border-black w-40 mx-auto"></div>
          <p className="text-[10px] text-slate-500 mt-1">Nama: {session.petugas || '.........................'}</p>
        </div>

        <div>
          <p className="font-semibold mb-16">Admin Inventory / Gudang</p>
          <div className="border-b border-black w-40 mx-auto"></div>
          <p className="text-[10px] text-slate-500 mt-1">Nama: ....................................</p>
        </div>

        <div>
          <p className="font-semibold mb-16">Supervisor / Kepala Gudang</p>
          <div className="border-b border-black w-40 mx-auto"></div>
          <p className="text-[10px] text-slate-500 mt-1">Nama: ....................................</p>
        </div>
      </div>
    </div>
  );
}
