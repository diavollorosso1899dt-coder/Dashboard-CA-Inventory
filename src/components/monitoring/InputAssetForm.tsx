'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  PlusCircle, 
  CheckCircle2, 
  Store, 
  DollarSign, 
  Layers, 
  FileText, 
  Image as ImageIcon,
  ArrowRight,
  Camera,
  UploadCloud,
  Trash2,
  ZoomIn,
  Star,
  X,
  RefreshCw
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
  const [quantityNeeded, setQuantityNeeded] = useState(1);
  const [rabPrice, setRabPrice] = useState(0);

  // Multiple Photos State
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fulfillment defaults
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

  // Compress image client-side to prevent large payload bottlenecks
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDimension = 1200;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = () => resolve(event.target?.result as string);
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingPhotos(true);
    try {
      const fileList = Array.from(e.target.files);
      const processed: string[] = [];
      for (const file of fileList) {
        if (file.type.startsWith('image/')) {
          const compressed = await compressImage(file);
          if (compressed) processed.push(compressed);
        }
      }
      setPhotos((prev) => [...prev, ...processed]);
    } catch (err) {
      console.error('Error reading photos:', err);
    } finally {
      setIsProcessingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimaryPhoto = (index: number) => {
    setPhotos((prev) => {
      const copy = [...prev];
      const [selected] = copy.splice(index, 1);
      return [selected, ...copy];
    });
  };

  const handleAddPhotoByUrl = () => {
    if (photoUrlInput.trim()) {
      setPhotos((prev) => [...prev, photoUrlInput.trim()]);
      setPhotoUrlInput('');
    }
  };

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
      const finalPhotoUrl = photos.length > 0 
        ? (photos.length === 1 ? photos[0] : JSON.stringify(photos)) 
        : null;

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
        photo_url: finalPhotoUrl,
        quantity_needed: quantityNeeded,
        rab_price: rabPrice,
        rab_total: calculatedTotal,
        stock_status: stockStatus,
        quantity_stock_allocated: quantityStock,
        quantity_pr: quantityPr || quantityNeeded,
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

          {/* Section 4: Foto & Dokumentasi Aset (Multiple Upload) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] pb-2">
              <div className="flex items-center gap-2 font-bold text-sm text-[#1f1f1f] dark:text-[#e3e3e3]">
                <Camera className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
                <span>4. Foto Dokumentasi Aset</span>
              </div>
              <span className="rounded-full bg-[#e8f0fe] dark:bg-[#004a77] px-2.5 py-0.5 text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa]">
                {photos.length > 0 ? `${photos.length} Foto Terpilih` : 'Multiple Foto Didukung'}
              </span>
            </div>

            {/* Upload Drag-and-Drop Area */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer rounded-2xl border-2 border-dashed border-[#c4c7c5] dark:border-[#444746] hover:border-[#0b57d0] dark:hover:border-[#a8c7fa] bg-[#f8fafd] dark:bg-[#1e1f20]/50 hover:bg-[#e8f0fe]/30 dark:hover:bg-[#004a77]/20 p-5 text-center transition-all duration-200 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFilesSelected}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="h-12 w-12 rounded-full bg-[#e8f0fe] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                  {isProcessingPhotos ? (
                    <RefreshCw className="h-6 w-6 animate-spin" />
                  ) : (
                    <UploadCloud className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
                    {isProcessingPhotos ? 'Sedang memproses foto...' : 'Klik untuk memilih foto atau seret file ke sini'}
                  </div>
                  <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-0.5">
                    Format JPG, PNG, WEBP. Dapat memilih <strong>banyak foto sekaligus</strong> (multiple file selection).
                  </p>
                </div>
              </div>
            </div>

            {/* Optional URL Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={photoUrlInput}
                onChange={(e) => setPhotoUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPhotoByUrl();
                  }
                }}
                placeholder="Atau masukkan URL foto online (opsional)..."
                className="flex-1 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f0f4f9] dark:bg-[#1e1f20] px-3 py-1.5 text-xs text-[#1f1f1f] dark:text-[#e3e3e3] focus:border-[#0b57d0] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPhotoByUrl}
                disabled={!photoUrlInput.trim()}
                className="rounded-xl border border-[#0b57d0] dark:border-[#a8c7fa] bg-[#e8f0fe] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] px-3.5 py-1.5 text-xs font-bold hover:bg-[#d3e3fd] disabled:opacity-40 transition-colors shrink-0"
              >
                + Tambah URL
              </button>
            </div>

            {/* Photo Gallery Thumbnails */}
            {photos.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-[11px] text-[#444746] dark:text-[#c4c7c5]">
                  <span className="font-semibold">Foto Terunggah ({photos.length} item):</span>
                  <button
                    type="button"
                    onClick={() => setPhotos([])}
                    className="text-[#b3261e] dark:text-[#f2b8b5] hover:underline"
                  >
                    Hapus Semua
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {photos.map((src, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] overflow-hidden shadow-xs hover:shadow-md transition-all aspect-square"
                    >
                      <img
                        src={src}
                        alt={`Foto Aset ${idx + 1}`}
                        className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200"
                        onClick={() => setPreviewModalImg(src)}
                      />

                      {/* Top Badges */}
                      <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                        {idx === 0 ? (
                          <span className="rounded-md bg-[#0b57d0] text-white text-[9px] font-bold px-1.5 py-0.5 shadow-sm flex items-center gap-0.5">
                            <Star className="h-2.5 w-2.5 fill-current" /> Utama
                          </span>
                        ) : (
                          <span className="rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold px-1.5 py-0.5">
                            #{idx + 1}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePhoto(idx);
                          }}
                          className="pointer-events-auto h-6 w-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow hover:bg-red-700 transition-colors"
                          title="Hapus foto ini"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Bottom Quick Controls */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setPreviewModalImg(src)}
                          className="text-[10px] text-white hover:text-[#a8c7fa] flex items-center gap-1 font-semibold"
                        >
                          <ZoomIn className="h-3 w-3" /> Lihat
                        </button>
                        {idx !== 0 && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryPhoto(idx)}
                            className="text-[10px] text-amber-300 hover:text-amber-200 font-semibold"
                          >
                            Set Utama
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* Lightbox / Enlarged Photo Modal */}
      {previewModalImg && (
        <div 
          onClick={() => setPreviewModalImg(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-3xl max-h-[85vh] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/20"
          >
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/70 text-white hover:bg-black flex items-center justify-center z-10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img 
              src={previewModalImg} 
              alt="Preview Foto Aset" 
              className="max-w-full max-h-[80vh] object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
