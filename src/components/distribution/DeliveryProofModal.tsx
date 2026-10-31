'use client';

import React, { useRef, useState, useEffect } from 'react';
import { 
  X, 
  PenTool, 
  Camera, 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  User, 
  FileText, 
  RotateCcw,
  Boxes,
  AlertCircle
} from 'lucide-react';
import { SuratJalan } from '@/lib/supabase/types';

interface DeliveryProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  suratJalan: SuratJalan;
  defaultReceiverName?: string;
  onConfirm: (proofData: {
    receiverName: string;
    signatureUrl: string;
    photoUrl?: string;
    notes: string;
  }) => Promise<void>;
}

export default function DeliveryProofModal({
  isOpen,
  onClose,
  suratJalan,
  defaultReceiverName = '',
  onConfirm,
}: DeliveryProofModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [receiverName, setReceiverName] = useState(defaultReceiverName || suratJalan.receiver_name || suratJalan.penerima_nama || '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('Seluruh item barang diterima lengkap dan dalam kondisi baik.');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const items = suratJalan.items || [];
  const totalUnits = items.reduce(
    (acc: number, it: any) => acc + (Number(it.received_quantity ?? it.quantity ?? it.qty ?? 1) || 1),
    0
  );

  // Setup canvas resolution and styling
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and set high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setHasSignature(false);
    setErrorMsg('');
  }, [isOpen]);

  if (!isOpen) return null;

  // Canvas Drawing Coordinates
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
    setErrorMsg('');
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Handle Photo Capture/Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran foto maksimal 5 MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverName.trim()) {
      setErrorMsg('Nama penerima / PIC outlet wajib diisi.');
      return;
    }

    if (!hasSignature) {
      setErrorMsg('Tanda tangan digital penerima wajib diisi di area canvas.');
      return;
    }

    const canvas = canvasRef.current;
    const signatureUrl = canvas ? canvas.toDataURL('image/png') : '';

    setSubmitting(true);
    try {
      await onConfirm({
        receiverName: receiverName.trim(),
        signatureUrl,
        photoUrl: photoPreview || undefined,
        notes: notes.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan bukti serah terima.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#111827] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Konfirmasi Seluruh Item Surat Jalan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {suratJalan.nomor_sj || suratJalan.sj_number || 'SJ-PENGIRIMAN'} &bull; {suratJalan.tujuan_outlet_nama || suratJalan.branch_name || 'Outlet'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Ringkasan Seluruh Item dalam Surat Jalan */}
          {items.length > 0 && (
            <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Diselesaikan Sekaligus: {items.length} Item ({totalUnits} Unit)</span>
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                  1x Konfirmasi Semua Item
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {items.map((it: any, idx: number) => {
                  const name = it.item_name || it.nama_barang || it.name || 'Barang';
                  const qty = it.received_quantity ?? it.quantity ?? it.qty ?? 1;
                  const unit = it.unit || it.satuan || 'Unit';
                  return (
                    <div
                      key={it.id || idx}
                      className="flex items-center justify-between text-[11px] bg-white/80 dark:bg-slate-900/60 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/50"
                    >
                      <span className="font-medium text-slate-700 dark:text-slate-200 truncate pr-2">
                        {idx + 1}. {name}
                      </span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                        {qty} {unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nama Penerima / PIC */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-500" />
              <span>Nama PIC Penerima Cabang <span className="text-rose-500">*</span></span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Budi (Store Manager Batam)"
              value={receiverName}
              onChange={(e) => setReceiverName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Canvas Tanda Tangan Digital */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-purple-500" />
                <span>Tanda Tangan Digital Penerima <span className="text-rose-500">*</span></span>
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Bersihkan</span>
              </button>
            </div>

            <div className="relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-inner">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-36 cursor-crosshair touch-none"
              />
              {!hasSignature && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-slate-400">
                  Goreskan tanda tangan PIC di area ini (Touchscreen / Mouse)
                </div>
              )}
            </div>
          </div>

          {/* Foto Bukti Fisik Barang Tiba */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-teal-500" />
              <span>Foto Fisik Barang / Bongkar Muat (Opsional)</span>
            </label>

            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Bukti serah terima" className="w-full h-44 object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoPreview(null)}
                  className="absolute top-2 right-2 p-1.5 rounded-xl bg-black/60 hover:bg-rose-600 text-white transition shadow-sm"
                  title="Hapus foto bukti"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition">
                <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Ambil Foto Kamera atau Upload Bukti
                </span>
                <span className="text-[10px] text-slate-400">JPG, PNG, atau WebP (Maks. 5 MB)</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Catatan Penerimaan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>Catatan Kondisi Barang Saat Tiba</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Barang lengkap, packing aman"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-medium transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition flex items-center gap-1.5 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : `Selesaikan Semua (${items.length || 1} Item)`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
