import React from 'react';
import { getOutlets } from '@/lib/supabase/server';
import { PlusCircle } from 'lucide-react';
import { InputAssetForm } from '@/components/monitoring/InputAssetForm';

export const dynamic = 'force-dynamic';

export default async function InputAssetPage() {
  const outlets = await getOutlets();

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="border-b border-[#e0e2ec] dark:border-[#444746] pb-4">
        <div className="flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <h1 className="text-xl md:text-2xl font-bold text-[#1f1f1f] dark:text-[#e3e3e3] tracking-tight">
            Input Aset Baru
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] mt-1">
          Formulir registrasi dan penambahan permohonan aset outlet baru ke sistem pemantauan terpusat.
        </p>
      </div>

      <InputAssetForm outlets={outlets} />
    </div>
  );
}
