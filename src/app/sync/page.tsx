'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { SyncSourceCard, type SyncSourceView } from '@/components/sync/SyncSourceCard';
import { SyncHistoryTable, type SyncRunView } from '@/components/sync/SyncHistoryTable';

export const dynamic = 'force-dynamic';

const DEFAULT_SOURCES: SyncSourceView[] = [
  { key: 'asset-requests', label: 'Aset (JABO + KALBAR)' },
  { key: 'request-orders', label: 'Request Order (JABO + KALBAR)' },
  { key: 'master-catalog', label: 'Master Katalog Item' },
];

export default function SyncPage() {
  const [sources, setSources] = useState<SyncSourceView[]>(DEFAULT_SOURCES);
  const [runs, setRuns] = useState<SyncRunView[]>([]);
  const [running, setRunning] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/sync/status', { cache: 'no-store' }),
        fetch('/api/sync/history?limit=20', { cache: 'no-store' }),
      ]);
      const status = await statusRes.json();
      const history = await historyRes.json();

      const latest = new Map<string, any>();
      for (const row of status.sources || []) {
        if (!latest.has(row.source_key)) latest.set(row.source_key, row);
      }
      setSources((prev) =>
        prev.map((s) => {
          const row = latest.get(s.key);
          return row
            ? {
                ...s,
                status: row.status,
                rowsFetched: row.rows_fetched,
                rowsInserted: row.rows_inserted,
                rowsUpdated: row.rows_updated,
                rowsStale: row.rows_stale,
                durationMs: row.duration_ms,
                message: row.error_message || undefined,
              }
            : s;
        })
      );
      setRuns(history.runs || []);
      setRunning(Boolean(status.running));
    } catch (error) {
      console.error('Gagal memuat status sync:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyResultSources = (data: any) => {
    if (!Array.isArray(data?.sources) || data.sources.length === 0) return;
    setSources((prev) =>
      prev.map((s) => {
        const row = data.sources.find((item: any) => item.key === s.key);
        return row
          ? {
              ...s,
              status: row.status,
              rowsFetched: row.rowsFetched,
              rowsInserted: row.rowsInserted,
              rowsUpdated: row.rowsUpdated,
              rowsStale: row.rowsStale,
              durationMs: row.durationMs,
              message: row.message || undefined,
            }
          : s;
      })
    );
  };

  const run = async (keys?: string[]) => {
    try {
      setRunning(true);
      setResult(null);
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: keys, dryRun, trigger: 'MANUAL' }),
      });
      const data = await res.json();
      setResult(data);
      applyResultSources(data);
      if (!dryRun) await refresh();
    } catch (error: any) {
      setResult({ success: false, message: error?.message || 'Gagal sync' });
    } finally {
      setRunning(false);
    }
  };

  const handleTriggerSync = () => run();

  const webhookScriptCode = `// Fungsi ini TIDAK berjalan otomatis dari namanya.
// Setelah menempel skrip, buat trigger: ikon jam > Add Trigger
//   Function     : syncKeHantaran
//   Event source : From spreadsheet
//   Event type   : On edit (atau On change / On form submit)
function syncKeHantaran(e) {
  // Masukkan URL domain dashboard Anda
  var webhookUrl = "https://your-dashboard-domain.com/api/sync";

  var options = {
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      // Samakan dengan env SYNC_TOKEN di server. Tanpa token, endpoint
      // hanya menerima sync manual dari dashboard yang sudah login.
      "x-sync-token": "ISI_TOKEN_RAHASIA"
    },
    // WEBHOOK membuat sync di-debounce 5 menit agar satu kali edit tidak
    // memicu sync berulang-ulang.
    "payload": JSON.stringify({ trigger: "WEBHOOK" }),
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
          Engine terpusat: Google Sheets → Supabase → HANTARAN. Satu arah, tanpa tulis balik ke sheet.
        </p>
      </div>

      {/* Sync Engine Card */}
      <div className="panel-card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
              Sinkronisasi Google Sheets ke Supabase
            </h2>
            <p className="text-xs text-[#444746] dark:text-[#c4c7c5] mt-1 max-w-2xl">
              Membaca sheet aset, RO, dan master item. Data yang sudah diubah di dashboard tidak
              ditimpa; baris yang hilang dari sheet hanya ditandai stale, tidak dihapus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5]">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Dry-run (tidak menulis)
            </label>
            <button
              onClick={handleTriggerSync}
              disabled={running}
              className="flex items-center justify-center gap-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-5 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Sedang Sinkronisasi...' : 'Run Semua Sumber'}
            </button>
          </div>
        </div>

        {/* Sync Result Banner */}
        {result && (
          <div
            className={`rounded-2xl p-3.5 text-xs border ${
              result.success
                ? 'bg-[#e6f4ea] dark:bg-[#0f5223]/50 border-[#ceead6] dark:border-[#0f5223] text-[#137333] dark:text-[#6dd58c]'
                : 'bg-[#fce8e6] dark:bg-[#601410]/50 border-[#f9dedc] dark:border-[#601410] text-[#b3261e] dark:text-[#f2b8b5]'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold mb-0.5">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {result.success ? 'Sinkronisasi Berhasil' : 'Sinkronisasi Gagal'}
              {result.skipped ? ` (${result.reason})` : ''}
            </div>
            <p>{result.message}</p>
            <p className="mt-0.5 text-[10px] opacity-80">
              Status: {result.status} • Durasi: {result.durationMs ?? 0} ms
              {result.dryRun ? ' • Dry-run' : ''}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sources.map((source) => (
            <SyncSourceCard
              key={source.key}
              source={source}
              running={running}
              onRun={(key) => run([key])}
            />
          ))}
        </div>
      </div>

      {/* Riwayat */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
          Riwayat 20 Run Terakhir
        </h2>
        <SyncHistoryTable runs={runs} />
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
              Jalankan{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">supabase/sync-engine.sql</code>{' '}
              setelah disetujui. Tabel{' '}
              <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">sync_runs</code>{' '}
              dan{' '}
              <code className="text-[#0b57d0] dark:text-[#a8c7fa] font-semibold">
                sync_run_sources
              </code>{' '}
              menyimpan riwayat engine.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              2. Kredensial API
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Isi{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">SYNC_TOKEN</code> dan{' '}
              <code className="text-[#1f1f1f] dark:text-[#e3e3e3]">CRON_SECRET</code> di Vercel.
              Cron berjalan 19.00 UTC = 02.00 WIB.
            </p>
          </div>

          <div className="rounded-2xl bg-[#f0f4f9] dark:bg-[#282a2c] p-4 border border-[#e0e2ec] dark:border-[#444746] space-y-1.5">
            <div className="font-bold text-[#1f1f1f] dark:text-[#e3e3e3] text-xs">
              3. Status Terkoneksi
            </div>
            <p className="text-[#444746] dark:text-[#c4c7c5] text-[11px]">
              Database Supabase aktif membaca dan menyimpan pembaruan status barang, PIC penerima,
              dan catatan dari dashboard.
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
            {copiedWebhook ? (
              <Check className="h-3.5 w-3.5 text-[#137333] dark:text-[#6dd58c]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedWebhook ? 'Tersalin' : 'Salin Skrip'}
          </button>
        </div>
        <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
          Jika ingin Google Sheets mentrigger pembaruan setiap ada baris baru, pasang skrip ini pada
          menu <strong>Extensions &gt; Apps Script</strong>, lalu buat trigger
          <em> On edit</em> untuk fungsi <code>syncKeHantaran</code> (lihat komentar di skrip):
        </p>

        <pre className="rounded-2xl bg-[#1e1f20] dark:bg-[#131314] p-3.5 text-[11px] text-[#6dd58c] font-mono overflow-x-auto border border-[#444746]">
          {webhookScriptCode}
        </pre>
      </div>
    </div>
  );
}