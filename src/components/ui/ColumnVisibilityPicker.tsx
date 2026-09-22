'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Columns3, Eye, EyeOff, Check, RotateCcw } from 'lucide-react';

export interface ColumnItem {
  id: string;
  label: string;
  alwaysVisible?: boolean;
  defaultVisible?: boolean;
}

interface ColumnVisibilityPickerProps {
  columns: ColumnItem[];
  visibleColumns: Record<string, boolean>;
  onChange: (visibleColumns: Record<string, boolean>) => void;
  storageKey?: string;
  align?: 'left' | 'right';
  buttonLabel?: string;
}

export function ColumnVisibilityPicker({
  columns,
  visibleColumns,
  onChange,
  storageKey,
  align = 'right',
  buttonLabel = 'Kolom',
}: ColumnVisibilityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleColumn = (colId: string) => {
    const col = columns.find((c) => c.id === colId);
    if (col?.alwaysVisible) return;

    const next = {
      ...visibleColumns,
      [colId]: visibleColumns[colId] === false ? true : false,
    };
    onChange(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    }
  };

  const showAll = () => {
    const next: Record<string, boolean> = {};
    columns.forEach((c) => {
      next[c.id] = true;
    });
    onChange(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    }
  };

  const resetDefault = () => {
    const next: Record<string, boolean> = {};
    columns.forEach((c) => {
      next[c.id] = true;
    });
    onChange(next);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
  };

  const hiddenCount = columns.filter((c) => !c.alwaysVisible && visibleColumns[c.id] === false).length;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`interactive-tap inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition shadow-xs select-none ${
          hiddenCount > 0
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
        }`}
        title="Atur visibilitas kolom tabel"
      >
        <Columns3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        <span>{buttonLabel}</span>
        {hiddenCount > 0 ? (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
            -{hiddenCount}
          </span>
        ) : null}
      </button>

      {isOpen && (
        <div
          className={`absolute z-40 mt-1.5 w-60 rounded-2xl bg-white dark:bg-slate-900 p-2.5 shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-800 px-1">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Visibilitas Kolom
            </span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={showAll}
                className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
              >
                Semua
              </button>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={resetDefault}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* List of Columns */}
          <div className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5">
            {columns.map((col) => {
              const isVisible = visibleColumns[col.id] !== false;
              const isLocked = col.alwaysVisible;

              return (
                <button
                  key={col.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => toggleColumn(col.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition text-left select-none ${
                    isLocked
                      ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/40 text-slate-500'
                      : isVisible
                      ? 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                        isVisible
                          ? 'bg-amber-600 border-amber-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {isVisible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span className={isVisible ? 'font-medium' : 'line-through opacity-75'}>
                      {col.label}
                    </span>
                  </div>

                  {isVisible ? (
                    <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to manage column visibility with localStorage persistence
 */
export function useColumnVisibility(
  storageKey: string,
  columns: ColumnItem[],
  defaultHidden: string[] = []
) {
  const getInitialState = (): Record<string, boolean> => {
    const base: Record<string, boolean> = {};
    columns.forEach((col) => {
      base[col.id] = col.defaultVisible !== false && !defaultHidden.includes(col.id);
    });
    return base;
  };

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(getInitialState);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setVisibleColumns((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}
  }, [storageKey]);

  const isVisible = (colId: string) => visibleColumns[colId] !== false;

  return {
    visibleColumns,
    setVisibleColumns,
    isVisible,
  };
}

export default ColumnVisibilityPicker;
