'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id?: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}

export function Toast({ toast, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold backdrop-blur-md transition-all ${
          isSuccess
            ? 'bg-emerald-50/95 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
            : isError
            ? 'bg-rose-50/95 dark:bg-rose-950/90 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800'
            : 'bg-blue-50/95 dark:bg-blue-950/90 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-800'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
        ) : (
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        )}

        <span className="max-w-xs sm:max-w-sm break-words leading-relaxed">{toast.message}</span>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
          aria-label="Tutup"
        >
          <X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}
