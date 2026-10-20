'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { SuratJalan, SJItem } from '@/lib/supabase/types';
import { Printer, ArrowLeft, Building2, Truck, ShieldCheck, CheckCircle, Layers, FileText } from 'lucide-react';

interface MergedSJItem extends SJItem {
  source_ro?: string;
  source_sj?: string;
}

export default function PrintSuratJalanPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string;
  const outletParam = searchParams ? searchParams.get('outlet') : null;

  const [sj, setSj] = useState<SuratJalan | null>(null);
  const [siblingDocs, setSiblingDocs] = useState<SuratJalan[]>([]);
  const [isConsolidated, setIsConsolidated] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSJ() {
      try {
        setLoading(true);
        // 1. Coba cari di API Surat Jalan Distribusi
        const res = await fetch('/api/distribution/surat-jalan');
        const json = await res.json();
        const allDocs: SuratJalan[] = Array.isArray(json.data) ? json.data : [];

        let found: SuratJalan | null = null;

        // Cari berdasarkan ID atau nomor SJ
        if (allDocs.length > 0) {
          found = allDocs.find(
            (item: any) =>
              item.id === id ||
              item.sj_number === id ||
              item.nomor_sj === id ||
              item.surat_jalan_number === id
          ) || null;
        }

        // 2. Jika belum ditemukan, fallback periksa data Pemantauan Transfer Distribusi
        if (!found) {
          const trRes = await fetch('/api/transfers');
          const trJson = await trRes.json();
          if (trJson.data && Array.isArray(trJson.data)) {
            const tr = trJson.data.find(
              (t: any) =>
                t.id === id ||
                t.surat_jalan_number === id ||
                t.transfer_number === id
            );
            if (tr) {
              found = {
                id: tr.id,
                nomor_sj: tr.surat_jalan_number || tr.transfer_number,
                sj_number: tr.surat_jalan_number || tr.transfer_number,
                ro_nomor: tr.transfer_number,
                ro_number: tr.transfer_number,
                tujuan_outlet_nama: tr.to_location,
                branch_name: tr.to_location,
                tanggal_kirim: tr.transfer_date,
                delivery_date: tr.transfer_date,
                driver_nama: tr.expedition_courier || 'Armada Internal SCGA',
                driver_name: tr.expedition_courier || 'Armada Internal SCGA',
                kendaraan_plat: tr.tracking_number,
                vehicle_number: tr.tracking_number,
                pengirim_nama: tr.sender_pic || 'Staff Logistik SCGA',
                sender_name: tr.sender_pic || 'Staff Logistik SCGA',
                penerima_nama: tr.receiver_pic || 'Store Manager Outlet',
                receiver_name: tr.receiver_pic || 'Store Manager Outlet',
                status: tr.status,
                items: tr.items || [],
                notes: tr.notes,
                created_at: tr.created_at || new Date().toISOString(),
              } as SuratJalan;
            }
          }
        }

        // Tentukan nama outlet target (dari found atau parameter URL)
        const targetOutlet = outletParam || (found?.tujuan_outlet_nama || found?.branch_name);

        if (targetOutlet && allDocs.length > 0) {
          const cleanTarget = targetOutlet.toLowerCase().trim();
          const siblings = allDocs.filter((doc) => {
            const docOutlet = (doc.tujuan_outlet_nama || doc.branch_name || '').toLowerCase().trim();
            return docOutlet === cleanTarget;
          });

          setSiblingDocs(siblings);
          if (!found && siblings.length > 0) {
            found = siblings[0];
          }
        } else if (found) {
          setSiblingDocs([found]);
        }

        setSj(found || null);
      } catch (err) {
        console.error('Failed to load SJ:', err);
      } finally {
        setLoading(false);
      }
    }
    if (id || outletParam) loadSJ();
  }, [id, outletParam]);

  // Kumpulkan & gabungkan semua item jika ada nama outlet yang sama
  const consolidatedData = useMemo(() => {
    if (!sj) return null;

    // Jika konsolidasi aktif dan ada dokumen dengan outlet sama lebih dari 1
    const docsToMerge = isConsolidated && siblingDocs.length > 0 ? siblingDocs : [sj];

    // Gabungkan seluruh item
    const mergedItems: MergedSJItem[] = [];
    const sjNumbersSet = new Set<string>();
    const roNumbersSet = new Set<string>();

    docsToMerge.forEach((doc) => {
      const docSj = doc.nomor_sj || doc.sj_number;
      if (docSj) sjNumbersSet.add(docSj);

      const docRo = doc.ro_nomor || doc.ro_number;
      if (docRo) roNumbersSet.add(docRo);

      (doc.items || []).forEach((it: any) => {
        mergedItems.push({
          ...it,
          source_ro: docRo,
          source_sj: docSj,
        });
      });
    });

    const totalQty = mergedItems.reduce((acc, it) => {
      const q = Number(it.qty ?? it.quantity ?? (it as any).quantity_ordered ?? (it as any).quantity_needed ?? 1);
      return acc + (isNaN(q) ? 1 : q);
    }, 0);

    return {
      docsCount: docsToMerge.length,
      sjNumbers: Array.from(sjNumbersSet),
      roNumbers: Array.from(roNumbersSet),
      items: mergedItems,
      totalQty,
    };
  }, [sj, siblingDocs, isConsolidated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500 font-medium animate-pulse flex items-center gap-2">
          <Truck className="w-5 h-5 animate-bounce text-indigo-600" />
          <span>Menyiapkan Dokumen Surat Jalan...</span>
        </div>
      </div>
    );
  }

  if (!sj || !consolidatedData) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-slate-800">Surat Jalan Tidak Ditemukan</h2>
        <p className="text-sm text-slate-500 mt-2">Nomor ID Surat Jalan tidak valid atau data telah terhapus.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
        >
          Kembali
        </button>
      </div>
    );
  }

  // Normalisasi Field Dokumen
  const displaySjNumber = consolidatedData.sjNumbers.length > 0 
    ? consolidatedData.sjNumbers.join(' / ') 
    : (sj.nomor_sj || sj.sj_number || (sj as any).surat_jalan_number || '-');

  const tujuanOutlet = sj.tujuan_outlet_nama || sj.branch_name || (sj as any).to_location || 'Outlet Tujuan';

  const displayRoNumber = consolidatedData.roNumbers.length > 0
    ? consolidatedData.roNumbers.join(', ')
    : (sj.ro_nomor || sj.ro_number || (sj as any).transfer_number || '-');

  const driverNama = sj.driver_nama || sj.driver_name || (sj as any).expedition_courier || 'Petugas Ekspedisi Logistik';
  const kendaraanPlat = sj.kendaraan_plat || sj.vehicle_number || (sj as any).tracking_number || 'B 9188 CA';
  const pengirimNama = sj.pengirim_nama || sj.sender_name || (sj as any).from_location || 'Gudang Logistik Pusat CA';
  const penerimaNama = sj.penerima_nama || sj.receiver_name || (sj as any).receiver_pic || `Store Manager ${tujuanOutlet}`;
  
  const rawDate = sj.delivery_date || sj.tanggal_kirim || sj.created_at;
  const tglDokumen = rawDate
    ? new Date(rawDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-4xl mx-auto py-4 px-4 sm:px-6">
      {/* Top Banner & Action Controls (Hidden on Print) */}
      <div className="print:hidden space-y-3 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-md">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> Dokumen Siap Cetak
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg hover:shadow-indigo-500/25 transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Lembar Surat Jalan (Print / PDF)</span>
            </button>
          </div>
        </div>

        {/* Notifikasi Penggabungan Dokumen Outlet yang Sama */}
        {siblingDocs.length > 1 && (
          <div className="p-3.5 px-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-blue-900 dark:text-blue-200">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold">
                  {siblingDocs.length} Dokumen Pengiriman Terkumpul untuk Outlet {tujuanOutlet}
                </span>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                  Seluruh aset dengan nama outlet yang sama otomatis dirangkum dalam <strong>1 daftar cetak Surat Jalan resmi</strong>.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer font-semibold text-blue-900 dark:text-blue-200 shrink-0">
              <input
                type="checkbox"
                checked={isConsolidated}
                onChange={(e) => setIsConsolidated(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Gabung Semua Item Outlet Ini</span>
            </label>
          </div>
        )}
      </div>

      {/* Official Document Paper */}
      <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-xl border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 print:rounded-none">
        {/* Letterhead / Kop Surat */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm tracking-wider">
                HNT
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 uppercase">
                  HANTARAN
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Divisi Central Asset Management &amp; Logistik Distribusi Nasional
                </p>
                <p className="text-xs text-slate-400">
                  Jl. Logistik Sentral No. 88, Kawasan Pergudangan Nasional &bull; Telp: (021) 555-0199
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black tracking-wider text-indigo-700 uppercase">
                SURAT JALAN
              </div>
              <div className="text-xs font-mono font-bold text-slate-700 mt-1 max-w-[280px] break-words">
                NOMOR: <span className="text-slate-900 font-bold">{displaySjNumber}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Tanggal: {tglDokumen}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Section */}
        <div className="grid grid-cols-2 gap-6 mb-6 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-700 block mb-1 uppercase tracking-wider text-[11px]">Pengirim / Asal:</span>
            <div className="font-semibold text-slate-900">{pengirimNama}</div>
            <div className="text-slate-500">Kawasan Pergudangan Pusat, Blok B-12</div>
            <div className="text-slate-500">PIC Gudang: Central Warehouse Officer</div>
          </div>

          <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-800 block mb-1 uppercase tracking-wider text-[11px]">Tujuan Pengiriman:</span>
            <div className="font-bold text-slate-900 text-sm">{tujuanOutlet}</div>
            <div className="text-slate-600 mt-1">
              Ref. Request Order: <strong className="font-mono text-indigo-700">{displayRoNumber}</strong>
            </div>
            {consolidatedData.docsCount > 1 && (
              <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                • Menggabungkan {consolidatedData.docsCount} Dokumen Distribusi Outlet
              </div>
            )}
            <div className="text-slate-500">Status: {sj.status || 'SHIPPED'}</div>
          </div>
        </div>

        {/* Armada & Driver Details */}
        <div className="flex items-center justify-between text-xs bg-slate-100 p-3 rounded-lg mb-6 border border-slate-200 flex-wrap gap-2">
          <div>
            <span className="text-slate-500">Nama Pengemudi (Driver):</span>{' '}
            <strong className="text-slate-800">{driverNama}</strong>
          </div>
          <div>
            <span className="text-slate-500">Nomor Polisi Kendaraan:</span>{' '}
            <strong className="font-mono text-slate-800 uppercase">{kendaraanPlat}</strong>
          </div>
          <div>
            <span className="text-slate-500">Estimasi Tiba:</span>{' '}
            <strong className="text-slate-800">{new Date(rawDate || Date.now()).toLocaleDateString('id-ID')} (Sameday / Next-Day)</strong>
          </div>
        </div>

        {/* Items Table (Seluruh Item Outlet Terkumpul dalam 1 Daftar) */}
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-300">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-semibold">
                <th className="py-2.5 px-3 w-12 text-center">No</th>
                <th className="py-2.5 px-3">Nama Barang / Deskripsi Aset</th>
                <th className="py-2.5 px-3 text-center w-24">Jumlah</th>
                <th className="py-2.5 px-3 text-center w-24">Satuan</th>
                <th className="py-2.5 px-3">Kondisi / Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {consolidatedData.items && consolidatedData.items.length > 0 ? (
                consolidatedData.items.map((item: any, index: number) => {
                  const namaBarang = item.nama_barang || item.item_name || item.name || item.system_item_name || 'Barang Aset';
                  const jumlah = item.qty ?? item.quantity ?? item.quantity_ordered ?? item.quantity_needed ?? 1;
                  const satuan = item.satuan || item.unit || 'Unit';
                  const spesifikasi = item.specification || item.classification || '';
                  const sourceRo = item.source_ro ? `[Ref: ${item.source_ro}] ` : '';
                  const catatan = item.catatan || item.notes || (spesifikasi ? spesifikasi : 'Kondisi Baik & Tersegel');

                  return (
                    <tr key={item.id || index} className="hover:bg-slate-50">
                      <td className="py-3 px-3 text-center font-medium text-slate-600">{index + 1}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <div>{namaBarang}</div>
                        {(spesifikasi || item.source_ro) && (
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            {sourceRo}{spesifikasi}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-900">{jumlah}</td>
                      <td className="py-3 px-3 text-center text-slate-600">{satuan}</td>
                      <td className="py-3 px-3 text-slate-500 italic">{catatan}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Tidak ada rincian item dalam Surat Jalan ini
                  </td>
                </tr>
              )}
            </tbody>
            {consolidatedData.items && consolidatedData.items.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={2} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px]">
                    Total Keseluruhan Barang ({consolidatedData.items.length} Baris):
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-sm text-indigo-700">
                    {consolidatedData.totalQty}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600">UNIT</td>
                  <td className="py-2.5 px-3 text-slate-500 font-normal italic text-[11px]">
                    Lengkap &amp; Siap Kirim
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Notes */}
        <div className="mb-8 p-3 rounded-lg border border-dashed border-slate-300 text-xs text-slate-600">
          <strong>Catatan Pengiriman:</strong>
          <p className="mt-0.5">
            Harap periksa kelengkapan fisik, segel, dan kondisi barang sebelum menandatangani lembar tanda terima ini. 
            Segala klaim kerusakan atau ketidaksesuaian jumlah wajib dicantumkan pada kolom catatan di atas dalam waktu 1x24 jam.
          </p>
        </div>

        {/* 3-Party Signatures */}
        <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-300 text-center text-xs">
          <div>
            <p className="font-semibold text-slate-700">Yang Menyerahkan,</p>
            <p className="text-slate-400 text-[10px]">Gudang Logistik Pusat</p>
            <div className="h-20 flex items-end justify-center">
              <div className="w-36 border-b border-slate-900 font-semibold pb-1">
                ( {pengirimNama || 'Staff Gudang Pusat'} )
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold text-slate-700">Yang Membawa,</p>
            <p className="text-slate-400 text-[10px]">Driver / Ekspedisi</p>
            <div className="h-20 flex items-end justify-center">
              <div className="w-36 border-b border-slate-900 font-semibold pb-1">
                ( {driverNama || 'Pengemudi'} )
              </div>
            </div>
          </div>

          <div>
            <p className="font-semibold text-slate-700">Yang Menerima,</p>
            <p className="text-slate-400 text-[10px]">Store / Outlet Manager</p>
            <div className="h-20 flex items-end justify-center">
              <div className="w-36 border-b border-slate-900 font-semibold pb-1">
                ( {penerimaNama || 'Kepala Toko / PIC'} )
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
