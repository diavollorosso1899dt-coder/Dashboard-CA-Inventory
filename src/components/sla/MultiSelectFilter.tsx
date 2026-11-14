'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Ringkasan saat tidak ada pilihan, mis. "Semua Alokasi Stok". */
  allLabel: string;
  /** Kata benda untuk ringkasan saat lebih dari satu dipilih, mis. "Alokasi". */
  noun: string;
  searchPlaceholder?: string;
  icon?: LucideIcon;
  ariaLabel?: string;
}

/**
 * Dropdown filter dengan pilihan ganda (checkbox).
 * Kosong = semua opsi. Dipakai untuk filter kolom SLA.
 */
export default function MultiSelectFilter({
  options,
  selected,
  onChange,
  allLabel,
  noun,
  searchPlaceholder = 'Cari...',
  icon: Icon,
  ariaLabel,
}: MultiSelectFilterProps) {
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

  const labelByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? labelByValue.get(selected[0]) || selected[0]
        : `${selected.length} ${noun} dipilih`;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAllVisible = () => {
    const merged = new Set([...selected, ...filteredOptions.map((option) => option.value)]);
    onChange(Array.from(merged));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={ariaLabel || allLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`interactive-tap inline-flex w-full items-center justify-between gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
          selected.length > 0
            ? 'border-[#0b57d0] bg-blue-50 text-[#0b57d0] dark:border-[#a8c7fa] dark:bg-blue-950/60 dark:text-[#a8c7fa]'
            : 'border-[#e0e2ec] bg-[#f8fafd] text-[#1f1f1f] hover:bg-slate-50 dark:border-[#444746] dark:bg-[#282a2c] dark:text-[#e3e3e3]'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate text-left">{summary}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[#e0e2ec] bg-white shadow-xl dark:border-[#444746] dark:bg-[#1a1c1e]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e0e2ec] px-3 py-2 dark:border-[#444746]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
              Pilih {noun}
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
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[#e0e2ec] bg-[#f8fafd] py-1.5 pl-8 pr-2 text-xs text-[#1f1f1f] focus:border-[#0b57d0] focus:outline-none dark:border-[#444746] dark:bg-[#282a2c] dark:text-[#e3e3e3]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[#747775] dark:text-[#8e918f]">
            <span>{filteredOptions.length} opsi</span>
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
                Opsi tidak ditemukan
              </li>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <li key={option.value} role="option" aria-selected={checked}>
                    <button
                      type="button"
                      onClick={() => toggle(option.value)}
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
                      <span className="truncate">{option.label}</span>
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
