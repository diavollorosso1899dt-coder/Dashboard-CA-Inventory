import React from 'react';
import { getAssetRequests } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { Layers, PlusCircle, ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function MonitoringAssetsPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const assetResponse = await getAssetRequests({ region, limit: 3000 });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
              Monitoring Status: Daftar Aset
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
            Master pemantauan seluruh item aset, alokasi stok gudang SCGA, status PR pengadaan, dan penerimaan di outlet.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/monitoring/transfer"
            className="flex items-center gap-1.5 rounded-full border border-[#e0e2ec] dark:border-[#444746] bg-[#ffffff] dark:bg-[#1e1f20] px-4 py-2 text-xs font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] hover:bg-[#f0f4f9] dark:hover:bg-[#282a2c] transition-colors"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            <span>Pemantauan Transfer Aset</span>
          </Link>
          <Link
            href="/monitoring/input"
            className="flex items-center gap-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] px-4 py-2 text-xs font-semibold text-white dark:text-[#041e49] hover:bg-[#0842a0] dark:hover:bg-[#d3e3fd] transition-colors shadow-sm"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Input Aset Baru</span>
          </Link>
        </div>
      </div>

      <AssetDataTable initialItems={assetResponse.data} regionFilter={region} />
    </div>
  );
}
