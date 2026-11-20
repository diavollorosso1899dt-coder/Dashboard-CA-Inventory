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
    if (!toast || toast.type === 'error') return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  const isSuccess = toast?.type === 'success';
  const isError = toast?.type === 'error';

  return (
    <>
      <div role="alert" className="sr-only">{isError ? toast.message : ''}</div>
      <div role="status" className="sr-only">{toast && !isError ? toast.message : ''}</div>
      {toast && (
        <div
          className={`fixed inset-x-4 bottom-4 z-50 flex items-start gap-2 rounded-xl border p-3 text-sm shadow-lg sm:bottom-6 sm:left-auto sm:right-6 sm:w-96 ${
            isSuccess
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : isError
              ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
              : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 aria-hidden="true" className="mt-2 size-4 shrink-0" />
          ) : isError ? (
            <AlertCircle aria-hidden="true" className="mt-2 size-4 shrink-0" />
          ) : (
            <Info aria-hidden="true" className="mt-2 size-4 shrink-0" />
          )}
          <p aria-hidden="true" className="min-w-0 flex-1 break-words py-1.5 leading-relaxed">{toast.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:hover:bg-white/10"
            aria-label="Tutup notifikasi"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
