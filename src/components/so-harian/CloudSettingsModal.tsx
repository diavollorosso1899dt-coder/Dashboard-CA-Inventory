'use client';

import React, { useState } from 'react';
import { X, Cloud, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { configureSupabase, getSupabaseConfig } from '@/lib/so-harian/storageService';

interface CloudSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: (isConfigured: boolean) => void;
}

export default function CloudSettingsModal({ isOpen, onClose, onConfigSaved }: CloudSettingsModalProps) {
  const currentConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url);
  const [supabaseKey, setSupabaseKey] = useState(currentConfig.anonKey);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    setStatusMsg(null);
    if (!supabaseUrl.trim() && !supabaseKey.trim()) {
      configureSupabase('', '');
      setStatusMsg({ type: 'success', text: 'Koneksi Cloud dinonaktifkan. Menggunakan penyimpanan lokal offline.' });
      onConfigSaved(false);
      return;
    }

    if (!supabaseUrl.startsWith('http')) {
      setStatusMsg({ type: 'error', text: 'URL Supabase harus diawali dengan https://' });
      return;
    }

    const res = configureSupabase(supabaseUrl.trim(), supabaseKey.trim());
    if (res.isConfigured) {
      setStatusMsg({ type: 'success', text: 'Koneksi Supabase berhasil disimpan! Data akan tersinkron otomatis antar HP & PC.' });
      onConfigSaved(true);
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Gagal mengonfigurasi koneksi.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-sm">Pengaturan Cloud Database (Supabase)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sinkronisasi Real-time antara HP &amp; PC</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl text-sky-800 dark:text-sky-300 flex items-start space-x-2">
            <HelpCircle className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Aplikasi tetap bisa berjalan tanpa Cloud</p>
              <p className="mt-0.5 text-sky-700 dark:text-sky-300/80">
                Jika dikosongkan, data otomatis tersimpan di memori browser lokal (offline). Masukkan kredensial Supabase jika ingin data tersambung langsung antara HP scanner dan PC admin.
              </p>
            </div>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2 ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              )}
              <span className="font-semibold">{statusMsg.text}</span>
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Supabase Project URL:</label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-sky-500 outline-none font-mono text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Supabase Anon Key:</label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-sky-500 outline-none font-mono text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <button
            onClick={() => {
              setSupabaseUrl('');
              setSupabaseKey('');
              handleSave();
            }}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-800"
          >
            Reset ke Offline
          </button>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all"
            >
              Tutup
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              Simpan Koneksi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
