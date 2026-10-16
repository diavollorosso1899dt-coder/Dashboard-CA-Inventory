'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, RefreshCw } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess }: BarcodeScannerModalProps) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'barcode-scanner-viewport';

  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode: Html5Qrcode | null = null;
    setIsStarting(true);
    setErrorMsg('');

    const startScanner = async () => {
      try {
        html5QrCode = new Html5Qrcode(readerElementId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.333334,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText: string) => {
            const cleanCode = decodedText.trim();
            if (cleanCode) {
              try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                  const ctx = new AudioCtx();
                  const osc = ctx.createOscillator();
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(880, ctx.currentTime);
                  osc.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.1);
                }
              } catch (e) {
                // AudioContext ignored
              }

              onScanSuccess(cleanCode);
              stopScanner();
              onClose();
            }
          },
          () => {
            // Scanning progress
          }
        );
        setIsStarting(false);
      } catch (err: any) {
        console.error('Camera start error:', err);
        setIsStarting(false);
        setErrorMsg(
          err?.message || 'Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan di browser.'
        );
      }
    };

    const timer = setTimeout(startScanner, 150);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 dark:bg-black/90 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Camera className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Scan Barcode / QR Barang</h3>
              <p className="text-[11px] text-slate-400">Arahkan kamera ke barcode SKU atau Kode Barang</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Area */}
        <div className="relative p-4 bg-black flex flex-col items-center justify-center min-h-[300px]">
          {isStarting && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 text-white space-y-2">
              <RefreshCw className="w-7 h-7 text-sky-400 animate-spin" />
              <p className="text-xs font-semibold">Menginisialisasi Kamera HP/PC...</p>
            </div>
          )}

          {errorMsg ? (
            <div className="p-6 text-center text-rose-300 space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
              <p className="text-xs font-medium">{errorMsg}</p>
              <button
                onClick={() => {
                  setErrorMsg('');
                  setIsStarting(true);
                  setTimeout(() => {
                    if (scannerRef.current) stopScanner();
                    onClose();
                  }, 100);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg"
              >
                Tutup &amp; Input Manual
              </button>
            </div>
          ) : (
            <div id={readerElementId} className="w-full max-w-[320px] rounded-xl overflow-hidden shadow-inner" />
          )}
        </div>

        {/* Footer instructions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dapat membaca barcode 1D (Code 128, EAN) dan 2D (QR Code).
          </p>
        </div>
      </div>
    </div>
  );
}
