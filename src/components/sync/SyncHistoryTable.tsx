'use client';

import React from 'react';

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

export function SyncHistoryTable({ runs }: { runs: SyncRunView[] }) {
  return (
    <div className="rounded-3xl border border-[#e0e2ec] dark:border-[#444746] bg-white dark:bg-[#1e1f20] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f0f4f9] dark:bg-[#282a2c] text-[11px] uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-3 py-3">Pemicu</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Sumber OK/Gagal</th>
              <th className="px-3 py-3">Durasi</th>
              <th className="px-4 py-3">Aktor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#747775] dark:text-[#8e918f]">
                  Belum ada riwayat sync.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(run.started_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-3 py-3">
                    {run.trigger}
                    {run.dry_run ? ' (dry)' : ''}
                  </td>
                  <td className="px-3 py-3 font-semibold">{run.status}</td>
                  <td className="px-3 py-3">
                    {run.ok_sources}/{run.failed_sources}
                  </td>
                  <td className="px-3 py-3">{run.duration_ms} ms</td>
                  <td className="px-4 py-3">{run.actor_name || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}