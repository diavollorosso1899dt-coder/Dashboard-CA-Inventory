'use client';

import React from 'react';
import type { ColumnItem } from '@/components/ui/ColumnVisibilityPicker';

export interface SyncRunView {
  id: string;
  started_at: string;
  trigger: string;
  status: string;
  ok_sources: number;
  failed_sources: number;
  duration_ms: number;
  actor_name?: string;
  message?: string;
  dry_run?: boolean;
}

export const SYNC_HISTORY_COLUMNS: ColumnItem[] = [
  { id: 'waktu', label: 'Waktu', defaultVisible: true, alwaysVisible: true },
  { id: 'pemicu', label: 'Pemicu', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  { id: 'sumber', label: 'Sumber OK/Gagal', defaultVisible: true },
  { id: 'durasi', label: 'Durasi', defaultVisible: true },
  { id: 'aktor', label: 'Aktor', defaultVisible: true },
];

export function SyncHistoryTable({
  runs,
  visibleColumns = {},
}: {
  runs: SyncRunView[];
  visibleColumns?: Record<string, boolean>;
}) {
  const show = (columnId: string) => visibleColumns[columnId] !== false;
  const visibleColumnCount = SYNC_HISTORY_COLUMNS.filter((column) =>
    show(column.id)
  ).length;

  return (
    <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
            <tr>
              {show('waktu') && <th className="px-4 py-3">Waktu</th>}
              {show('pemicu') && <th className="px-3 py-3">Pemicu</th>}
              {show('status') && <th className="px-3 py-3">Status</th>}
              {show('sumber') && <th className="px-3 py-3">Sumber OK/Gagal</th>}
              {show('durasi') && <th className="px-3 py-3">Durasi</th>}
              {show('aktor') && <th className="px-4 py-3">Aktor</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
            {runs.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnCount}
                  className="px-4 py-10 text-center text-[#747775] dark:text-[#8e918f]"
                >
                  Belum ada riwayat sync.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  {show('waktu') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(run.started_at).toLocaleString('id-ID')}
                    </td>
                  )}
                  {show('pemicu') && (
                    <td className="px-3 py-3">
                      {run.trigger}
                      {run.dry_run ? ' (dry)' : ''}
                    </td>
                  )}
                  {show('status') && (
                    <td className="px-3 py-3 font-semibold">{run.status}</td>
                  )}
                  {show('sumber') && (
                    <td className="px-3 py-3">
                      {run.ok_sources}/{run.failed_sources}
                    </td>
                  )}
                  {show('durasi') && (
                    <td className="px-3 py-3">{run.duration_ms} ms</td>
                  )}
                  {show('aktor') && (
                    <td className="px-4 py-3">{run.actor_name || '-'}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
