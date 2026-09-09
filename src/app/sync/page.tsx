'use client';

import React, { useState } from 'react';
import { 
  RefreshCw, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Zap 
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function SyncPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const handleTriggerSync = async () => {
    try {
      setIsSyncing(true);
      setSyncResult(null);
      const res = await fetch('/api/sync?force=true', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || 'Gagal sinkronisasi' });
    } finally {
      setIsSyncing(false);
    }
  };

  const webhookScriptCode = `function onEditOrNewRow(e) {
  // Masukkan URL domain dashboard Anda
  var webhookUrl = "https://your-dashboard-domain.com/api/sync";
  
  var options = {
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "muteHttpExceptions": true
  };
  
  try {
    UrlFetchApp.fetch(webhookUrl, options);
  } catch(err) {
    Logger.log("Sync error: " + err);
  }
}`;

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Sinkronisasi dan Basis Data
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Kelola integrasi data Google Sheets (sumber input transaksi) dan basis data Supabase (basis data aplikasi).
        </p>
      </div>

      {/* Sync Engine Card */}
      <div className="panel-card p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">Sinkronisasi Google Sheets ke Supabase</h2>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1 max-w-2xl">
              Membaca data sheet JABO dan KALBAR, menormalisasi tanggal dan jam (hh:mm), nomor RAB, status stok, serta melakukan penyimpanan data tanpa menimpa perubahan manual di dashboard.
            </p>
          </div>

          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shrink-0 shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sedang Sinkronisasi...' : 'Sinkronkan Sekarang'}
          </button>
        </div>

        {/* Sync Result Banner */}
        {syncResult && (
          <div
            className={`rounded-2xl p-3.5 text-xs border ${
              syncResult.success
                ? 'bg-[#e6f4ea] dark:bg-[#0f5223]/50 border-[#ceead6] dark:border-[#0f5223] text-[#137333] dark:text-[#6dd58c]'
                : 'bg-[#fce8e6] dark:bg-[#601410]/50 border-[#f9dedc] dark:border-[#601410] text-[#b3261e] dark:text-[#f2b8b5]'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold mb-0.5">
              {syncResult.success ? <CheckCircle2 className="h-4 w-4 text-[#137333] dark:text-[#6dd58c]" /> : <AlertCircle className="h-4 w-4 text-[#b3261e] dark:text-[#f2b8b5]" />}
              {syncResult.success ? 'Sinkronisasi Berhasil' : 'Sinkronisasi Gagal'}
            </div>
            <p>{syncResult.message}</p>
            {syncResult.durationMs && (
              <p className="mt-0.5 text-[10px] text-[#747775] dark:text-[#8e918f]">Durasi: {syncResult.durationMs} ms</p>
            )}
          </div>
        )}
      </div>

      {/* Supabase Connection Setup Guide */}
      <div className="panel-card p-5 space-y-3.5">
        <div className="flex items-center gap-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-sm">
          <Database className="h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span>Panduan Setup Supabase Database</span>
        </div>
        <p className="text-xs text-[#444746] dark:text-[#c4c7c5] leading-relaxed">
          Struktur konfigurasi integrasi Supabase pada proyek:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              1. Skema Tabel PostgreSQL
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Tabel <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">asset_requests</code> dan <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">sync_logs</code> dibuat melalui skrip <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">supabase/schema.sql</code>.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              2. Kredensial API
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Project URL dan API Keys dikonfigurasi melalui variabel environment pada file <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">.env.local</code>.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              3. Status Terkoneksi
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Database Supabase aktif membaca dan menyimpan pembaruan status barang, PIC penerima, dan catatan dari dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook Google Apps Script Snippet */}
      <div className="panel-card p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#1f1f1f] dark:text-[#e3e3e3] font-bold text-sm">
            <Zap className="h-4 w-4 text-[#b06000] dark:text-[#ffb951]" />
            <span>Skrip Push Otomatis Google Apps Script (Opsional)</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(webhookScriptCode);
              setCopiedWebhook(true);
              setTimeout(() => setCopiedWebhook(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#282a2c] px-3.5 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#333537]"
          >
            {copiedWebhook ? <Check className="h-3.5 w-3.5 text-[#137333] dark:text-[#6dd58c]" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedWebhook ? 'Tersalin' : 'Salin Skrip'}
          </button>
        </div>
        <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
          Jika ingin Google Sheets mentrigger pembaruan setiap ada baris baru, pasang skrip ini pada menu <strong>Extensions &gt; Apps Script</strong> di spreadsheet:
        </p>

        <pre className="rounded-2xl bg-[#1e1f20] dark:bg-[#131314] p-3.5 text-[11px] text-[#6dd58c] font-mono overflow-x-auto border border-[#444746]">
          {webhookScriptCode}
        </pre>
      </div>
    </div>
  );
}
