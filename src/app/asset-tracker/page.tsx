import React from 'react';
import { getAssetRequests } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import { TableProperties } from 'lucide-react';
import { AssetDataTable } from '@/components/tracker/AssetDataTable';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function AssetTrackerPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const assetResponse = await getAssetRequests({ region, limit: 2000 });

  return (
    <div className="space-y-6 pb-12">
      {/* Google M3 Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <TableProperties className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Pelacakan dan Editor Aset Master
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Tabel interaktif dengan pencarian No RAB, timestamp jam input (hh:mm), status alokasi stok gudang, dan editor status langsung ke Supabase.
        </p>
      </div>

      <AssetDataTable initialItems={assetResponse.data} regionFilter={region} />
    </div>
  );
}
