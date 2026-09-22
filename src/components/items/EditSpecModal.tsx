'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  X, 
  Save, 
  Loader2, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Tag,
  Layers,
  ExternalLink
} from 'lucide-react';

interface EditSpecModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  currentSpecification?: string;
  classification?: string;
  unit?: string;
  photoUrl?: string | null;
  onSuccess: (updatedItemName: string, newSpecification: string) => void;
}

export default function EditSpecModal({
  isOpen,
  onClose,
  itemName,
  currentSpecification = '',
  classification,
  unit,
  photoUrl,
  onSuccess,
}: EditSpecModalProps) {
  const [specText, setSpecText] = useState(currentSpecification);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSpecText(currentSpecification || '');
    setErrorMsg(null);
  }, [currentSpecification, itemName, isOpen]);

  if (!isOpen) return null;

  const handleAppendTemplate = (template: string) => {
    setSpecText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return template;
      return `${trimmed}\n${template}`;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);

    try {
      const res = await fetch('/api/items/update-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          specification: specText.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal menyimpan spesifikasi.');
      }

      onSuccess(itemName, specText.trim());
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat menyimpan spesifikasi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Edit Spesifikasi Item Aset
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs font-mono">
                {itemName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Item Meta Bar */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={itemName}
                className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Tag className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white truncate">
                {itemName}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                {classification && (
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    {classification}
                  </span>
                )}
                {unit && (
                  <span className="px-2 py-0.5 rounded-md font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    Satuan: {unit}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Template Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Template Cepat:
              </span>
              <span className="text-[10px] text-slate-400">
                Klik untuk menyisipkan
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleAppendTemplate('Dimensi: P x L x T cm')}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                + Dimensi
              </button>
              <button
                type="button"
                onClick={() => handleAppendTemplate('Daya Listrik: ... Watt (220V)')}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                + Daya (Watt)
              </button>
              <button
                type="button"
                onClick={() => handleAppendTemplate('Material / Bahan: Stainless Steel 304')}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                + Bahan / Material
              </button>
              <button
                type="button"
                onClick={() => handleAppendTemplate('Merk / Model: ...')}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                + Merk/Model
              </button>
            </div>
          </div>

          {/* Textarea Spesifikasi */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Rincian Spesifikasi Teknis
            </label>
            <textarea
              rows={5}
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder="Tuliskan spesifikasi detail barang di sini, contoh:&#10;Kapasitas 17 Liter, Daya 3000 Watt, Dimensi 55x45x40 cm, Material Full Stainless Steel anti karat..."
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-sans"
              autoFocus
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>Mendukung teks multi-baris atau URL link referensi katalog</span>
              <span>{specText.length} karakter</span>
            </div>
          </div>

          {/* Error Feedback */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="interactive-tap flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Supabase...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan Spesifikasi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
