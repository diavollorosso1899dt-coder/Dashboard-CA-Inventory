'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

interface SearchableSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

interface DropdownRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/**
 * Combobox satu pilihan yang bisa diketik untuk mencari.
 *
 * - Fokus membuka daftar dan memilih seluruh teks, sehingga mengetik langsung
 *   mengganti nilai lama.
 * - Teks yang tidak cocok dengan opsi mana pun akan dikembalikan ke nilai valid
 *   terakhir saat blur, jadi form tidak bisa berisi nama outlet asal-asalan.
 * - Daftar dirender lewat portal agar tidak terpotong oleh container modal yang
 *   memakai `overflow-y-auto`.
 */
export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Pilih opsi...',
  ariaLabel,
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const rawId = useId();
  const listId = `searchable-select-${rawId.replace(/:/g, '')}`;

  const allOptions = useMemo(() => {
    const set = new Set(options.filter(Boolean));
    // Nilai tersimpan yang tidak lagi ada di daftar tetap ditampilkan.
    if (value) set.add(value);
    return Array.from(set);
  }, [options, value]);

  const query = text.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    // Saat baru fokus, tampilkan semua opsi meskipun teks sama dengan nilai terpilih.
    if (!query || text === value) return allOptions;
    return allOptions.filter((option) => option.toLowerCase().includes(query));
  }, [allOptions, query, text, value]);

  useEffect(() => {
    if (!open) setText(value);
  }, [value, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const updateRect = () => {
    const input = inputRef.current;
    if (!input) return;
    const box = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom - 8;
    const spaceAbove = box.top - 8;
    const dropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    setRect({
      top: dropUp ? Math.max(8, box.top - Math.min(256, spaceAbove) - 4) : box.bottom + 4,
      left: box.left,
      width: box.width,
      maxHeight: Math.max(120, Math.min(256, dropUp ? spaceAbove : spaceBelow)),
    });
  };

  useEffect(() => {
    if (!open) return;
    updateRect();

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setText(value);
    };
    const handleReposition = () => updateRect();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, listId]);

  const openList = () => {
    if (disabled) return;
    if (!open) {
      setOpen(true);
      const currentIndex = allOptions.indexOf(value);
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  };

  const commit = (option: string) => {
    setText(option);
    setOpen(false);
    if (option !== value) onChange(option);
    inputRef.current?.focus();
  };

  const revertOrCommit = () => {
    const match = allOptions.find(
      (option) => option.toLowerCase() === text.trim().toLowerCase()
    );
    if (match) {
      if (match !== value) onChange(match);
      setText(match);
    } else {
      setText(value);
    }
    setOpen(false);
  };

  const handleFocus = () => {
    openList();
    // Pilih seluruh teks agar ketikan pertama langsung menggantikan nilai lama.
    window.requestAnimationFrame(() => inputRef.current?.select());
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    setOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (open) {
        event.preventDefault();
        const option = filteredOptions[activeIndex];
        if (option) commit(option);
        else revertOrCommit();
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setText(value);
        setOpen(false);
      }
    } else if (event.key === 'Tab') {
      revertOrCommit();
    }
  };

  const handleBlur = () => {
    // Klik opsi memakai onMouseDown preventDefault, jadi blur di sini berarti
    // fokus benar-benar meninggalkan komponen.
    revertOrCommit();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#747775] dark:text-[#8e918f]" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filteredOptions[activeIndex]
              ? `${listId}-opt-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onFocus={handleFocus}
          onClick={openList}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full rounded-xl border border-[#e0e2ec] bg-white py-2 pl-9 pr-8 text-xs text-[#1f1f1f] focus:border-[#0b57d0] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#444746] dark:bg-[#1e1f20] dark:text-[#e3e3e3]"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Buka daftar pilihan"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setText(value);
              setOpen(false);
            } else {
              inputRef.current?.focus();
              openList();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#747775] hover:text-[#0b57d0] dark:text-[#8e918f] dark:hover:text-[#a8c7fa]"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
            }}
            className="z-[100] overflow-y-auto rounded-xl border border-[#e0e2ec] bg-white py-1 text-xs shadow-xl dark:border-[#444746] dark:bg-[#1e1f20]"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-center text-[#747775] dark:text-[#8e918f]">
                Opsi tidak ditemukan
              </li>
            ) : (
              filteredOptions.map((option, index) => {
                const selected = option === value;
                const active = index === activeIndex;
                return (
                  <li
                    key={option}
                    id={`${listId}-opt-${index}`}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                    className={`flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 transition-colors ${
                      selected
                        ? 'bg-[#e8f0fe] font-semibold text-[#0b57d0] dark:bg-[#004a77]/40 dark:text-[#a8c7fa]'
                        : active
                          ? 'bg-[#f0f4f9] text-[#1f1f1f] dark:bg-[#282a2c] dark:text-[#e3e3e3]'
                          : 'text-[#1f1f1f] dark:text-[#e3e3e3]'
                    }`}
                  >
                    <span className="truncate">{option}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}