import React from 'react';
import { getAssetTransfers, getOutlets } from '@/lib/supabase/server';
import { ArrowRightLeft } from 'lucide-react';
import { TransferAssetView } from '@/components/monitoring/TransferAssetView';

export const dynamic = 'force-dynamic';

export default async function TransferAssetPage() {
  const [transfers, outlets] = await Promise.all([
    getAssetTransfers(),
    getOutlets(),
  ]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Pemantauan Transfer Aset
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Pencatatan mutasi dan pemindahan inventaris antar cabang, dari Gudang Pusat SCGA ke Outlet, maupun relokasi aset antar outlet.
        </p>
      </div>

      <TransferAssetView initialTransfers={transfers} outlets={outlets} />
    </div>
  );
}
