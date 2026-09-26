'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { normalizeRegion, StandardRegion } from '@/lib/utils/region-helper';
import { MapPin } from 'lucide-react';

interface AreaFilterPillsProps {
  value?: string;
  onChange?: (region: StandardRegion) => void;
  syncUrl?: boolean;
  showIcon?: boolean;
  label?: string;
  className?: string;
}

export default function AreaFilterPills({
  value,
  onChange,
  syncUrl = true,
  showIcon = false,
  label,
  className = '',
}: AreaFilterPillsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // If value is not provided via prop, read directly from URL searchParams
  const urlRegion = searchParams ? searchParams.get('region') : null;
  const currentRegion: StandardRegion = normalizeRegion(value !== undefined ? value : urlRegion);

  const handleSelect = (selected: StandardRegion) => {
    if (onChange) {
      onChange(selected);
    }

    if (syncUrl && router && pathname) {
      const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
      if (selected === 'ALL') {
        params.delete('region');
      } else {
        params.set('region', selected);
      }
      const newQuery = params.toString();
      const targetUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      router.push(targetUrl);
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {label && (
        <span className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1 select-none">
          {showIcon && <MapPin className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />}
          {label}
        </span>
      )}
      <div className="inline-flex items-center rounded-full bg-[#e9eef6] dark:bg-[#282a2c] p-1 text-xs">
        <button
          type="button"
          onClick={() => handleSelect('ALL')}
          className={`rounded-full px-3 py-1 font-medium transition-all ${
            currentRegion === 'ALL'
              ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
              : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
          }`}
          title="Tampilkan semua area (Jabodetabek & Kalbar)"
        >
          Semua
        </button>
        <button
          type="button"
          onClick={() => handleSelect('JABODETABEK')}
          className={`rounded-full px-3 py-1 font-medium transition-all ${
            currentRegion === 'JABODETABEK'
              ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
              : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
          }`}
          title="Filter hanya area Jabodetabek"
        >
          JABO
        </button>
        <button
          type="button"
          onClick={() => handleSelect('KALBAR')}
          className={`rounded-full px-3 py-1 font-medium transition-all ${
            currentRegion === 'KALBAR'
              ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
              : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
          }`}
          title="Filter hanya area Kalimantan Barat (Kalbar)"
        >
          KALBAR
        </button>
      </div>
    </div>
  );
}
