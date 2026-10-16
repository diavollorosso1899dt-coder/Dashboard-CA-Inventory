'use client';

import React from 'react';
import { X, FileSpreadsheet } from 'lucide-react';

interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  data: any[];
}

export default function DataPreviewModal({ isOpen, onClose, title, data = [] }: DataPreviewModalProps) {
  if (!isOpen) return null;

  const keys = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Menampilkan {data.length} baris data transaksi terdeteksi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto p-4">
          {data.length === 0 ? (
            <div className="py-12 text-center text-slate-400">Belum ada baris data untuk ditampilkan</div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 w-12 text-center">#</th>
                    {keys.map((k) => (
                      <th key={k} className="py-2.5 px-3 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        {k.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-slate-600 dark:text-slate-300 font-medium">
                  {data.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="hover:bg-sky-50/50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                      {keys.map((k) => (
                        <td key={k} className="py-2 px-3 whitespace-nowrap">
                          {row[k] !== undefined && row[k] !== null ? String(row[k]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 100 && (
                <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700">
                  ... dan {data.length - 100} baris lainnya
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  );
}
