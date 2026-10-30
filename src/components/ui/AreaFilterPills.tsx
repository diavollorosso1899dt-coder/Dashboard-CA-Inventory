'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { normalizeRegion, StandardRegion } from '@/lib/utils/region-helper';
import { resolveEffectiveRegion } from '@/lib/access/app-feature';
import { useAuth } from '@/components/auth/AuthContext';
import { MapPin, Lock } from 'lucide-react';

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
  const { isSuperUser, allowedRegion, isRegionLocked } = useAuth();

  // If value is not provided via prop, read directly from URL searchParams
  const urlRegion = searchParams ? searchParams.get('region') : null;
  const rawRegion: StandardRegion = normalizeRegion(value !== undefined ? value : urlRegion);
  const currentRegion: StandardRegion = isRegionLocked
    ? (resolveEffectiveRegion(rawRegion, allowedRegion, isSuperUser) as StandardRegion)
    : rawRegion;

  useEffect(() => {
    if (!isRegionLocked) return;
    if (value !== undefined && normalizeRegion(value) !== allowedRegion && onChange) {
      onChange(allowedRegion as StandardRegion);
    }
    if (syncUrl && router && pathname && normalizeRegion(urlRegion) !== allowedRegion) {
      const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
      params.set('region', allowedRegion);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [isRegionLocked, allowedRegion, value, urlRegion, syncUrl, router, pathname, searchParams, onChange]);

  const handleSelect = (selected: StandardRegion) => {
    const effective = isRegionLocked ? (allowedRegion as StandardRegion) : selected;
    if (onChange) {
      onChange(effective);
    }

    if (syncUrl && router && pathname) {
      const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
      if (effective === 'ALL') {
        params.delete('region');
      } else {
        params.set('region', effective);
      }
      const newQuery = params.toString();
      const targetUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      router.push(targetUrl);
    }
  };

  if (isRegionLocked) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        {label && (
          <span className="text-xs font-semibold text-[#444746] dark:text-[#c4c7c5] flex items-center gap-1 select-none">
            {showIcon && <MapPin className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />}
            {label}
          </span>
        )}
        <div
          className="inline-flex items-center rounded-full bg-[#e9eef6] dark:bg-[#282a2c] p-1 text-xs"
          title={`Akses akun dikunci khusus area ${allowedRegion === 'JABODETABEK' ? 'JABODETABEK' : 'KALBAR'}`}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]">
            <Lock className="w-3 h-3 opacity-80" />
            <span>{allowedRegion === 'JABODETABEK' ? 'JABO' : 'KALBAR'}</span>
          </span>
        </div>
      </div>
    );
  }

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
