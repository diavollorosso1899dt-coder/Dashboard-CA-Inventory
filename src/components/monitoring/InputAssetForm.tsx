'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  PlusCircle, 
  CheckCircle2, 
  Store, 
  DollarSign, 
  Layers, 
  FileText, 
  Image as ImageIcon,
  ArrowRight
} from 'lucide-react';
import { Outlet } from '@/lib/supabase/types';
import Link from 'next/link';

interface InputAssetFormProps {
  outlets: Outlet[];
}

export function InputAssetForm({ outlets: initialOutlets }: InputAssetFormProps) {
  const router = useRouter();

  const [outletsList, setOutletsList] = useState<Outlet[]>(initialOutlets);
  const [region, setRegion] = useState<'JABODETABEK' | 'KALBAR'>('JABODETABEK');
  const [isNewOutlet, setIsNewOutlet] = useState(false);
  const [branchName, setBranchName] = useState(initialOutlets[0]?.branch_name || initialOutlets[0]?.nama || 'Mie Ayam Muntjul Karawang');
  const [newBranchName, setNewBranchName] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [requesterName, setRequesterName] = useState('Tim BusDev');
  const [requesterDivision, setRequesterDivision] = useState('BusDev');
  const [rabNumber, setRabNumber] = useState('');
  const [rabLink, setRabLink] = useState('');
  const [itemName, setItemName] = useState('');
  const [systemItemName, setSystemItemName] = useState('');
  const [classification, setClassification] = useState('AST-Furniture');
  const [specification, setSpecification] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [quantityNeeded, setQuantityNeeded] = useState(1);
  const [rabPrice, setRabPrice] = useState(0);
  const [stockStatus, setStockStatus] = useState('Not Ready (Stok Kosong)');
  const [quantityStock, setQuantityStock] = useState(0);
  const [quantityPr, setQuantityPr] = useState(0);
  const [isDirectShipment, setIsDirectShipment] = useState(false);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAsset, setSubmittedAsset] = useState<any>(null);

  const calculatedTotal = quantityNeeded * rabPrice;

  // Filter existing outlets based on selected region
  const regionalOutlets = outletsList.filter((o) => {
    if (region === 'JABODETABEK') {
      return o.region === 'JABODETABEK' || o.region === 'JABO';
    }
    return o.region === 'KALBAR';
  });

  const finalBranchName = isNewOutlet ? newBranchName.trim() : branchName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalBranchName) {
      alert('Nama Cabang / Outlet wajib diisi.');
      return;
    }
    if (!itemName.trim() || !rabNumber.trim()) {
      alert('Nama Item dan Nomor RAB wajib diisi.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        region,
        branch_name: finalBranchName,
        category: `New Outlet ${region === 'KALBAR' ? 'KALBAR' : 'JABO'}`,
        opening_date: openingDate || null,
        requester_name: requesterName,
        requester_division: requesterDivision,
        rab_number: rabNumber,
        rab_link: rabLink,
        item_name: itemName,
        system_item_name: systemItemName || itemName,
        classification,
        specification,
        photo_url: photoUrl || null,
        quantity_needed: quantityNeeded,
        rab_price: rabPrice,
        rab_total: calculatedTotal,
        stock_status: stockStatus,
        quantity_stock_allocated: quantityStock,
        quantity_pr: quantityPr,
        is_direct_shipment: isDirectShipment,
        notes,
      };

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSubmittedAsset(json.data);

        // If new outlet was entered, add to local outletsList and select it
        if (isNewOutlet && newBranchName) {
          const newOutletObj: Outlet = {
            id: `out-${Date.now()}`,
            branch_name: newBranchName.trim(),
            nama: newBranchName.trim(),
            region,
            target_opening_date: openingDate || null,
            target_opening: openingDate || null,
            status: 'Persiapan Buka',
            created_at: new Date().toISOString(),
          };
          setOutletsList((prev) => [...prev, newOutletObj]);
          setBranchName(newBranchName.trim());
          setIsNewOutlet(false);
          setNewBranchName('');
        }

        // Reset item fields
        setItemName('');
        setSystemItemName('');
        setSpecification('');
        setRabNumber('');
        setRabPrice(0);
        setQuantityNeeded(1);

        // Refresh router so other server components fetch latest data
        router.refresh();
      } else {
        alert(json.error || 'Gagal menyimpan aset.');
      }
    } catch (err) {
      console.error('Failed to create asset:', err);
      alert('Terjadi kesalahan jaringan saat menyimpan aset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Success Notification Banner */}
      {submittedAsset && (
        <div className="rounded-2xl bg-[#e6f4ea] dark:bg-[#0f5223]/40 border border-[#ceead6] dark:border-[#0f5223] p-4 text-xs text-[#137333] dark:text-[#6dd58c] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#137333] dark:text-[#6dd58c] shrink-0" />
            <div>
              <div className="font-bold text-sm">Aset Baru Berhasil Didaftarkan!</div>
              <p className="mt-0.5 text-[#444746] dark:text-[#c4c7c5]">
                Item <strong>{submittedAsset.item_name}</strong> telah masuk ke master pemantauan untuk cabang <strong>{submittedAsset.branch_name}</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/monitoring/assets"
              className="flex items-center gap-1 rounded-full bg-[#137333] dark:bg-[#6dd58c] text-white dark:text-[#072711] px-4 py-1.5 font-bold hover:bg-[#0f5223] transition-colors"
            >
              <span>Lihat di Daftar Aset</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => setSubmittedAsset(null)}
              className="px-3 py-1.5 rounded-full border border-[#ceead6] text-[#137333] dark:text-[#6dd58c] font-semibold"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Main Registration Card */}
      <div className="panel-card p-6 shadow-sm border border-[#e0e2ec] dark:border-[#444746]">
        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* Section 1: Cabang & Wilayah */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
              <Store className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>1. Informasi Lokasi &amp; Pengajuan</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Wilayah</label>
                <select
                  value={region}
                  onChange={(e: any) => {
                    const newReg = e.target.value;
                    setRegion(newReg);
                    const matching = outletsList.filter((o) =>
                      newReg === 'JABODETABEK'
                        ? o.region === 'JABODETABEK' || o.region === 'JABO'
                        : o.region === 'KALBAR'
                    );
                    if (matching.length > 0 && !isNewOutlet) {
                      setBranchName(matching[0].branch_name || matching[0].nama || '');
                    }
                  }}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="JABODETABEK">JABODETABEK</option>
                  <option value="KALBAR">KALBAR</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-[#444746] dark:text-[#c4c7c5]">
                    Cabang / Outlet <span className="text-[#b3261e]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewOutlet(!isNewOutlet);
                      if (!isNewOutlet && !newBranchName) {
                        setNewBranchName('');
                      }
                    }}
                    className="text-[11px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] hover:underline"
                  >
                    {isNewOutlet ? '← Pilih dari Daftar' : '+ Outlet Baru'}
                  </button>
                </div>

                {isNewOutlet ? (
                  <input
                    type="text"
                    required
                    placeholder="Ketik Nama Outlet Baru (cth: CA - Mall Kelapa Gading 3)"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="w-full rounded-xl border border-[#0b57d0] dark:border-[#a8c7fa] bg-[#ffffff] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:outline-none ring-2 ring-[#0b57d0]/20 font-medium"
                  />
                ) : (
                  <select
                    value={branchName}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsNewOutlet(true);
                      } else {
                        setBranchName(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                  >
                    {regionalOutlets.map((o) => {
                      const bName = o.branch_name || o.nama;
                      return (
                        <option key={o.id || bName} value={bName}>
                          {bName} ({o.region})
                        </option>
                      );
                    })}
                    <option value="__NEW__" className="font-bold text-[#0b57d0]">
                      + [Ketik Outlet Baru / New Outlet...]
                    </option>
                  </select>
                )}
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Nama Pengaju (PIC)</label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>

            {/* Target Opening Date row (always visible or highlighted when adding new outlet) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Target Tanggal Opening Outlet {isNewOutlet && <span className="text-emerald-600 dark:text-emerald-400">(Rekomendasi diisi)</span>}
                </label>
                <input
                  type="date"
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Divisi Pengaju</label>
                <input
                  type="text"
                  value={requesterDivision}
                  onChange={(e) => setRequesterDivision(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Anggaran & No RAB */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
              <DollarSign className="h-4 w-4 text-[#137333] dark:text-[#6dd58c]" />
              <span>2. Dokumen RAB &amp; Anggaran</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Nomor RAB <span className="text-[#b3261e]">*</span>
                </label>
                <input
                  type="text"
                  value={rabNumber}
                  onChange={(e) => setRabNumber(e.target.value)}
                  placeholder="Contoh: RAB-2026-MUNTJUL-001"
                  required
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Link Dokumen RAB (Opsional)</label>
                <input
                  type="url"
                  value={rabLink}
                  onChange={(e) => setRabLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Spesifikasi Item Aset */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
              <Layers className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>3. Detail Spesifikasi Item Aset</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">
                  Nama Item yang Diajukan <span className="text-[#b3261e]">*</span>
                </label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Contoh: Chiller Undercounter 2 Pintu Stainless"
                  required
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Klasifikasi Aset</label>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
                >
                  <option value="AST-Kitchen">AST-Kitchen (Dapur / Masak)</option>
                  <option value="AST-Furniture">AST-Furniture (Meja, Kursi)</option>
                  <option value="AST-Electronic">AST-Electronic (Chiller, AC, Freezer)</option>
                  <option value="PLK Service">PLK Service &amp; Display</option>
                  <option value="IT & POS">IT &amp; Mesin Kasir</option>
                  <option value="General">General / Operasional Lainnya</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Spesifikasi Teknis &amp; Dimensi</label>
              <textarea
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                rows={2}
                placeholder="Ukuran p x l x t, material bahan, daya listrik (watt), merk, dll."
                className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Jumlah Kebutuhan</label>
                <input
                  type="number"
                  min={1}
                  value={quantityNeeded}
                  onChange={(e) => setQuantityNeeded(parseInt(e.target.value) || 1)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Harga Satuan RAB (Rp)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={rabPrice}
                  onChange={(e) => setRabPrice(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Total Anggaran RAB</label>
                <div className="rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3 py-2 text-[#137333] dark:text-[#6dd58c] font-bold font-mono">
                  Rp {calculatedTotal.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Alokasi Stok & Logistik */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3] border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
              <FileText className="h-4 w-4 text-[#b06000] dark:text-[#ffb951]" />
              <span>4. Alokasi Stok Gudang SCGA &amp; Rencana Pengiriman</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Status Stok Gudang</label>
                <select
                  value={stockStatus}
                  onChange={(e) => setStockStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                >
                  <option value="Ready (Spek Sesuai)">Ready (Spek Sesuai)</option>
                  <option value="Ready (Spek Berbeda)">Ready (Spek Berbeda)</option>
                  <option value="Not Ready (Stok Kosong)">Not Ready (Stok Kosong)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Alokasi Stok Gudang</label>
                <input
                  type="number"
                  min={0}
                  value={quantityStock}
                  onChange={(e) => setQuantityStock(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#444746] dark:text-[#c4c7c5] mb-1">Jumlah PR (Beli Baru)</label>
                <input
                  type="number"
                  min={0}
                  value={quantityPr}
                  onChange={(e) => setQuantityPr(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-2 text-[#1f1f1f] dark:text-[#e3e3e3]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="directShip"
                checked={isDirectShipment}
                onChange={(e) => setIsDirectShipment(e.target.checked)}
                className="rounded border-[#747775] text-[#0b57d0] focus:ring-0 h-4 w-4"
              />
              <label htmlFor="directShip" className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
                Pengiriman Langsung Ekspedisi / Vendor ke Outlet (Direct Shipment)
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e0e2ec] dark:border-[#444746]">
            <button
              type="button"
              onClick={() => router.push('/monitoring/assets')}
              className="rounded-full border border-[#e0e2ec] dark:border-[#444746] px-5 py-2 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]"
            >
              Kembali ke Daftar Aset
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-6 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] disabled:opacity-50 shadow-sm"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{isSubmitting ? 'Mendaftarkan...' : 'Simpan Aset Baru'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
