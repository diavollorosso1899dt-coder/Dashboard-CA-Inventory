'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie, 
  Legend 
} from 'recharts';
import { DashboardMetrics } from '@/lib/supabase/types';
import { formatIDR } from '@/lib/utils/date-formatter';

interface SlaChartsProps {
  metrics: DashboardMetrics;
}

export function SlaCharts({ metrics }: SlaChartsProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const deliveryData = [
    { name: 'Siap / Lengkap (SCGA)', count: metrics.completed_count, color: '#10b981' },
    { name: 'Terpenuhi Sebagian', count: metrics.partial_count, color: '#0284c7' },
    { name: 'On Proses PR', count: metrics.in_progress_count, color: '#d97706' },
    { name: 'Belum Terpenuhi', count: metrics.pending_count, color: '#64748b' },
  ];

  const stockPieData = [
    { name: 'Stok Gudang SCGA', value: metrics.fulfilled_from_stock || 1, color: '#10b981' },
    { name: 'Pengadaan Baru (PR)', value: metrics.fulfilled_from_pr || 1, color: '#0284c7' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* 1. Status Pemenuhan & Alokasi Barang */}
      <div className="panel-card p-5 flex flex-col min-h-[300px]">
        <div className="mb-3">
          <h3 className="font-semibold text-white text-sm">Status Pemenuhan dan Kesiapan Barang</h3>
          <p className="text-xs text-slate-400">Distribusi kesiapan alokasi barang dari gudang vs proses PR</p>
        </div>
        <div className="h-60 w-full mt-auto">
          {isMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deliveryData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}>
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={135} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '6px', fontSize: '12px' }}
                  formatter={(value: any) => [`${value} item`, 'Jumlah']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {deliveryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Memuat grafik...
            </div>
          )}
        </div>
      </div>

      {/* 2. Rasio Pemenuhan Stok Gudang vs Beli Baru */}
      <div className="panel-card p-5 flex flex-col min-h-[300px]">
        <div className="mb-3">
          <h3 className="font-semibold text-white text-sm">Sumber Alokasi Kebutuhan</h3>
          <p className="text-xs text-slate-400">Rasio stok gudang SCGA versus pengadaan baru (PR)</p>
        </div>
        <div className="h-60 w-full flex items-center justify-center mt-auto">
          {isMounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stockPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {stockPieData.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '6px', fontSize: '12px' }}
                  formatter={(value: any) => [`${value} unit`, 'Volume']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={32} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Memuat grafik...
            </div>
          )}
        </div>
      </div>

      {/* 3. Rekapitulasi Anggaran RAB */}
      <div className="panel-card p-5 flex flex-col justify-between min-h-[300px]">
        <div>
          <h3 className="font-semibold text-white text-sm">Rekapitulasi Anggaran RAB</h3>
          <p className="text-xs text-slate-400">Total nilai anggaran permohonan yang diajukan</p>
        </div>

        <div className="space-y-3 my-auto pt-2">
          <div className="rounded-lg bg-slate-900 p-3.5 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Total Nilai Anggaran RAB:</span>
              <span className="font-bold text-base text-emerald-400">{formatIDR(metrics.total_rab_amount)}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Realisasi Harga (Dashboard):</span>
              <span className="font-medium text-slate-200">
                {metrics.total_deal_amount > 0 ? formatIDR(metrics.total_deal_amount) : 'Dikelola di Dashboard'}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Rasio Kesiapan Stok Gudang:</span>
              <span className="font-bold text-emerald-400">
                {metrics.stock_fulfillment_rate}%
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-900 p-3 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            Sebanyak <strong>{metrics.stock_fulfillment_rate}%</strong> volume kebutuhan langsung dialokasikan dari stok gudang aset SCGA, meminimalkan pembelian baru melalui PR.
          </div>
        </div>
      </div>
    </div>
  );
}
