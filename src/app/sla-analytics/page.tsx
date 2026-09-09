import React from 'react';
import { calculateDashboardMetrics, getAssetRequests } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Clock, ShieldAlert } from 'lucide-react';
import { formatLeadTime, formatDateTime } from '@/lib/utils/date-formatter';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function SlaAnalyticsPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const [metrics, assetResponse] = await Promise.all([
    calculateDashboardMetrics(region),
    getAssetRequests({ region, limit: 1000 }),
  ]);

  // Find overdue items (> 14 days and still not complete)
  const overdueItems = assetResponse.data.filter((item) => {
    const isCompleted = (item.item_delivery_status || '').toLowerCase().includes('lengkap');
    return !isCompleted && item.lead_time_days > 14;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#b06000] dark:text-[#ffb951]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            SLA dan Lead Time Pengadaan
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Pemantauan durasi waktu dari input order permohonan hingga barang diterima di lokasi outlet.
        </p>
      </div>

      {/* Google M3 SLA Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
        <div className="panel-card p-4">
          <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] uppercase font-bold">Rata-rata Lead Time</div>
          <div className="text-2xl font-bold text-[#b06000] dark:text-[#ffb951] mt-1.5">
            {formatLeadTime(metrics.avg_lead_time_days)}
          </div>
          <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1">Dihitung dari tanggal order ke tanggal terima</p>
        </div>

        <div className="panel-card p-4">
          <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] uppercase font-bold">Pengadaan On-Time (&le; 14 Hari)</div>
          <div className="text-2xl font-bold text-[#137333] dark:text-[#6dd58c] mt-1.5">
            {metrics.sla_on_time_count}
            <span className="text-xs font-normal text-[#444746] dark:text-[#c4c7c5] ml-1">item</span>
          </div>
          <p className="text-[11px] text-[#137333] dark:text-[#6dd58c] mt-1">Sesuai target standar SLA</p>
        </div>

        <div className="panel-card p-4">
          <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] uppercase font-bold">Melebihi Target (&gt; 14 Hari)</div>
          <div className="text-2xl font-bold text-[#b3261e] dark:text-[#f2b8b5] mt-1.5">
            {metrics.sla_delayed_count}
            <span className="text-xs font-normal text-[#444746] dark:text-[#c4c7c5] ml-1">item</span>
          </div>
          <p className="text-[11px] text-[#b3261e] dark:text-[#f2b8b5] mt-1">Memerlukan tindak lanjut vendor</p>
        </div>

        <div className="panel-card p-4">
          <div className="text-[11px] text-[#444746] dark:text-[#c4c7c5] uppercase font-bold">Pending Melewati Target</div>
          <div className="text-2xl font-bold text-[#0b57d0] dark:text-[#a8c7fa] mt-1.5">
            {overdueItems.length}
            <span className="text-xs font-normal text-[#444746] dark:text-[#c4c7c5] ml-1">item</span>
          </div>
          <p className="text-[11px] text-[#747775] dark:text-[#8e918f] mt-1">Belum lengkap dan &gt; 14 hari proses</p>
        </div>
      </div>

      {/* Overdue Items Alert Table if any */}
      {overdueItems.length > 0 && (
        <div className="rounded-2xl border border-[#f9dedc] dark:border-[#601410] bg-[#fce8e6]/60 dark:bg-[#1e1f20] p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-2 text-[#b3261e] dark:text-[#f2b8b5] font-bold text-sm">
            <ShieldAlert className="h-4 w-4" />
            <span>Item Melewati Target SLA dan Belum Lengkap ({overdueItems.length} Item)</span>
          </div>
          <p className="text-xs text-[#444746] dark:text-[#c4c7c5]">
            Daftar permohonan yang membutuhkan konfirmasi vendor karena durasi pengadaan sudah melewati SLA standar.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#1f1f1f] dark:text-[#e3e3e3]">
              <thead className="border-b border-[#e0e2ec] dark:border-[#444746] text-[11px] font-bold text-[#444746] dark:text-[#c4c7c5] bg-[#f0f4f9] dark:bg-[#282a2c]">
                <tr>
                  <th className="py-2.5 px-3">Waktu Order</th>
                  <th className="py-2.5 px-3">Cabang</th>
                  <th className="py-2.5 px-3">Item</th>
                  <th className="py-2.5 px-3">Vendor</th>
                  <th className="py-2.5 px-3">Durasi</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e2ec] dark:divide-[#444746]/60">
                {overdueItems.slice(0, 10).map((it) => (
                  <tr key={it.id} className="hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c]">
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium">{formatDateTime(it.order_datetime)}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">{it.branch_name}</td>
                    <td className="py-2.5 px-3 text-[#1f1f1f] dark:text-[#e3e3e3]">{it.item_name}</td>
                    <td className="py-2.5 px-3">{it.vendor_name || '-'}</td>
                    <td className="py-2.5 px-3 font-bold text-[#b3261e] dark:text-[#f2b8b5]">{formatLeadTime(it.lead_time_days)}</td>
                    <td className="py-2.5 px-3">
                      <span className="rounded-full bg-[#fce8e6] dark:bg-[#601410]/80 px-2.5 py-0.5 text-[10px] font-bold text-[#b3261e] dark:text-[#f2b8b5] border border-[#f9dedc]">
                        {it.item_delivery_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Asset Grid */}
      <div className="space-y-2.5 pt-1">
        <h2 className="text-sm font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">Semua Data SLA Pengadaan</h2>
        <AssetDataTable initialItems={assetResponse.data} regionFilter={region} />
      </div>
    </div>
  );
}
