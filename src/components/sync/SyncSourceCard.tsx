'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Loader2, Play, MinusCircle } from 'lucide-react';

export interface SyncSourceView {
  key: string;
  label: string;
  status?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RUNNING';
  rowsFetched?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsStale?: number;
  durationMs?: number;
  message?: string;
}

export function SyncSourceCard({
  source,
  running,
  onRun,
}: {
  source: SyncSourceView;
  running: boolean;
  onRun: (key: string) => void;
}) {
  const status = source.status;
  const icon =
    status === 'SUCCESS' ? (
      <CheckCircle2 className="h-4 w-4 text-[#137333] dark:text-[#6dd58c]" />
    ) : status === 'FAILED' ? (
      <AlertCircle className="h-4 w-4 text-[#b3261e] dark:text-[#f2b8b5]" />
    ) : status === 'SKIPPED' ? (
      <MinusCircle className="h-4 w-4 text-[#747775] dark:text-[#8e918f]" />
    ) : (
      <Loader2
        className={`h-4 w-4 text-[#0b57d0] dark:text-[#a8c7fa] ${running ? 'animate-spin' : ''}`}
      />
    );

  return (
    <div className="rounded-2xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {icon}
            {source.label}
          </div>
          <div className="mt-1 text-[11px] text-[#747775] dark:text-[#8e918f]">{source.key}</div>
        </div>
        <button
          type="button"
          onClick={() => onRun(source.key)}
          disabled={running}
          className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] px-3 py-1.5 text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] hover:bg-[#f0f4f9] dark:hover:bg-[#333537] disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          Run
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#444746] dark:text-[#c4c7c5]">
        <div>
          Dibaca: <strong>{source.rowsFetched ?? 0}</strong>
        </div>
        <div>
          Ditulis: <strong>{(source.rowsInserted ?? 0) + (source.rowsUpdated ?? 0)}</strong>
        </div>
        <div>
          Stale: <strong>{source.rowsStale ?? 0}</strong>
        </div>
        <div>
          Durasi: <strong>{source.durationMs ?? 0} ms</strong>
        </div>
      </div>

      {source.message && (
        <p className="text-[11px] text-[#747775] dark:text-[#8e918f] line-clamp-2">
          {source.message}
        </p>
      )}
    </div>
  );
}