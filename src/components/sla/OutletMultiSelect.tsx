'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Store, X } from 'lucide-react';

interface OutletMultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
  /** Tombol melebar penuh, dipakai saat diletakkan di dalam grid filter. */
  fullWidth?: boolean;
}

/**
 * Dropdown filter outlet dengan pilihan ganda (checkbox).
 * Kosong = semua outlet. Dipakai untuk memfilter data & perhitungan SLA.
 */
export default function OutletMultiSelect({
  options = [],
  selected = [],
  onChange,
  label = 'Filter outlet atau cabang',
  fullWidth = false,
}: OutletMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  const summary =
    selected.length === 0
      ? `Semua Outlet (${options.length})`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} Outlet dipilih`;

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const selectAllVisible = () => {
    const merged = new Set([...selected, ...filteredOptions]);
    onChange(Array.from(merged));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter seluruh data & perhitungan SLA berdasarkan satu atau beberapa outlet"
        className={`interactive-tap inline-flex items-center gap-1.5 rounded-full border pl-3 pr-2 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
          fullWidth ? 'w-full justify-between' : ''
        } ${
          selected.length > 0
            ? 'border-[#0b57d0] bg-blue-50 text-[#0b57d0] dark:border-[#a8c7fa] dark:bg-blue-950/60 dark:text-[#a8c7fa]'
            : 'border-[#e0e2ec] bg-white text-[#1f1f1f] hover:bg-slate-50 dark:border-[#444746] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]'
        }`}
      >
        <Store className="h-3.5 w-3.5" />
        <span className={`truncate ${fullWidth ? 'flex-1 text-left' : 'max-w-[180px]'}`}>{summary}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[#e0e2ec] bg-white shadow-xl dark:border-[#444746] dark:bg-[#1a1c1e]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e0e2ec] px-3 py-2 dark:border-[#444746]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
              Pilih Outlet
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0b57d0] hover:underline dark:text-[#a8c7fa]"
              >
                <X className="h-3 w-3" />
                <span>Kosongkan</span>
              </button>
            )}
          </div>

          <div className="border-b border-[#e0e2ec] px-3 py-2 dark:border-[#444746]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#747775]" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari outlet..."
                className="w-full rounded-lg border border-[#e0e2ec] bg-[#f8fafd] py-1.5 pl-8 pr-2 text-xs text-[#1f1f1f] focus:border-[#0b57d0] focus:outline-none dark:border-[#444746] dark:bg-[#282a2c] dark:text-[#e3e3e3]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[#747775] dark:text-[#8e918f]">
            <span>{filteredOptions.length} outlet</span>
            <button
              type="button"
              onClick={selectAllVisible}
              className="font-semibold text-[#0b57d0] hover:underline dark:text-[#a8c7fa]"
            >
              Pilih semua
            </button>
          </div>

          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto px-1.5 pb-2">
            {filteredOptions.length === 0 ? (
              <li className="px-2 py-3 text-center text-[11px] text-[#747775] dark:text-[#8e918f]">
                Outlet tidak ditemukan
              </li>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option);
                return (
                  <li key={option} role="option" aria-selected={checked}>
                    <button
                      type="button"
                      onClick={() => toggle(option)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                        checked
                          ? 'bg-blue-50 font-semibold text-[#0b57d0] dark:bg-blue-950/60 dark:text-[#a8c7fa]'
                          : 'text-[#1f1f1f] hover:bg-slate-50 dark:text-[#e3e3e3] dark:hover:bg-[#282a2c]'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-[#0b57d0] bg-[#0b57d0] text-white dark:border-[#a8c7fa] dark:bg-[#a8c7fa] dark:text-[#1a1c1e]'
                            : 'border-[#c4c7c5] dark:border-[#5f6368]'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{option}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}