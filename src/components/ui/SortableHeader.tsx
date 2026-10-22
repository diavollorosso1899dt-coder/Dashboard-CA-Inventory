'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSortField: string | null;
  currentSortDirection: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

/**
 * Komponen Header Kolom Tabel yang dapat diklik tanpa tombol mencolok ("tombol tidak terlihat")
 * Menampilkan ikon pengurutan halus pada hover atau ketika aktif diurutkan.
 */
export function SortableHeader({
  label,
  field,
  currentSortField,
  currentSortDirection,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps) {
  const isActive = currentSortField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`group w-full flex items-center gap-1.5 py-1 px-1 -mx-1 rounded-md transition-all cursor-pointer select-none border-0 bg-transparent text-inherit font-inherit uppercase tracking-inherit ${
        align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
      } hover:bg-slate-200/50 dark:hover:bg-[#333537]/50 ${className}`}
      title={`Klik untuk mengurutkan kolom ${label} ${
        isActive
          ? currentSortDirection === 'asc'
            ? '(Menaik A-Z / Terlama - Klik untuk menurun Z-A / Terbaru)'
            : '(Menurun Z-A / Terbaru - Klik untuk reset)'
          : '(Otomatis)'
      }`}
    >
      <span className={isActive ? 'text-[#0b57d0] dark:text-[#a8c7fa] font-extrabold' : ''}>
        {label}
      </span>
      <span
        className={`inline-flex shrink-0 transition-opacity ${
          isActive
            ? 'opacity-100 text-[#0b57d0] dark:text-[#a8c7fa]'
            : 'opacity-0 group-hover:opacity-60 text-slate-400'
        }`}
      >
        {isActive ? (
          currentSortDirection === 'asc' ? (
            <ArrowUp className="w-3 h-3 stroke-[2.5]" />
          ) : (
            <ArrowDown className="w-3 h-3 stroke-[2.5]" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3" />
        )}
      </span>
    </button>
  );
}

/**
 * Hook bantuan untuk mengurutkan data array secara otomatis berdasarkan kolom
 */
export function useTableSort<T>(
  items: T[],
  defaultField: string | null = null,
  defaultDirection: SortDirection = 'asc',
  customSortFns?: Record<string, (a: T, b: T) => number>
) {
  const [sortField, setSortField] = useState<string | null>(defaultField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortField) return items;

    return [...items].sort((a, b) => {
      if (customSortFns && customSortFns[sortField]) {
        const customRes = customSortFns[sortField](a, b);
        return sortDirection === 'asc' ? customRes : -customRes;
      }

      let valA = (a as any)[sortField];
      let valB = (b as any)[sortField];

      if (valA == null) valA = '';
      if (valB == null) valB = '';

      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        cmp = valA === valB ? 0 : valA ? 1 : -1;
      } else {
        const strA = String(valA).trim();
        const strB = String(valB).trim();
        // Check if both are valid dates
        const dateA = Date.parse(strA);
        const dateB = Date.parse(strB);
        if (!isNaN(dateA) && !isNaN(dateB) && (strA.includes('-') || strA.includes('/'))) {
          cmp = dateA - dateB;
        } else {
          cmp = strA.localeCompare(strB, 'id', { numeric: true, sensitivity: 'base' });
        }
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [items, sortField, sortDirection, customSortFns]);

  return {
    sortField,
    sortDirection,
    handleSort,
    sortedItems,
  };
}
