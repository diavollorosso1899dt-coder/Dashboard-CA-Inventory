'use client';

import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Check } from 'lucide-react';
import { SOItem } from '@/lib/so-harian/inventoryEngine';

interface NotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: SOItem | null;
  onSaveNote: (itemId: string, note: string) => void;
}

export default function NotesModal({ isOpen, onClose, item, onSaveNote }: NotesModalProps) {
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (item) {
      setNoteText(item.catatan || '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSave = () => {
    onSaveNote(item.id, noteText);
    onClose();
  };

  const quickReasons = [
    'Barang rusak / pecah di rak',
    'Selisih surat jalan pengiriman belum tercatat',
    'Barang terselip di rak lain',
    'Kemasan sobek / expired',
    'Salah hitung fisik sebelumnya',
    'Barang retur belum di-input ke sistem',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Catatan / Alasan Selisih</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{item.kode_barang} - {item.nama_barang}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Item variance pill */}
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 block">Stok Sistem: <strong className="text-slate-700 dark:text-slate-200">{item.stok_sistem} {item.satuan}</strong></span>
              <span className="text-slate-500 dark:text-slate-400 block">Fisik SO: <strong className="text-slate-700 dark:text-slate-200">{item.qty_fisik ?? '-'} {item.satuan}</strong></span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 dark:text-slate-400 block">Selisih (Varian):</span>
              <span
                className={`font-black text-sm px-2 py-0.5 rounded-md inline-block ${
                  item.status_selisih === 'MATCH'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : item.status_selisih === 'MINUS'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                    : item.status_selisih === 'PLUS'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.selisih !== null ? `${item.selisih > 0 ? '+' : ''}${item.selisih} ${item.satuan}` : '-'}
              </span>
            </div>
          </div>

          {/* Quick Select Preset Buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Pilih Alasan Cepat:</label>
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((reason, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNoteText((prev) => (prev ? `${prev}, ${reason}` : reason))}
                  className="text-[11px] bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-600 transition-colors text-left"
                >
                  + {reason}
                </button>
              ))}
            </div>
          </div>

          {/* Text Area */}
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Keterangan Tambahan / Penjelasan:</label>
            <textarea
              rows={3}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Tuliskan keterangan detail investigasi selisih..."
              className="w-full text-xs p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Simpan Catatan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
