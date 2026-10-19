'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Package, 
  PlusCircle, 
  GitPullRequest, 
  ShoppingCart, 
  Truck, 
  ArrowLeftRight, 
  Clock, 
  Boxes, 
  Store, 
  Users, 
  Trash2, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  HelpCircle, 
  CheckCircle2, 
  ShieldCheck, 
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { APP_FEATURES, AppFeature } from '@/lib/supabase/types';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

// Icon and aesthetic map per feature ID
const FEATURE_META: Record<string, {
  icon: React.ElementType;
  gradient: string;
  badgeColor: string;
  highlights: string[];
  tips: string;
}> = {
  dashboard: {
    icon: LayoutDashboard,
    gradient: 'from-blue-500/20 to-indigo-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    highlights: [
      'Pantau metrik KPI kesiapan cabang baru secara real-time',
      'Lihat ringkasan total aset, permohonan RO, dan efisiensi budget RAB',
      'Filter data cepat berdasarkan Wilayah (Jabodetabek, Jabo, Kalbar)',
    ],
    tips: 'Gunakan kartu metrik di atas untuk melihat cabang dengan status kritis H-3 pembukaan.',
  },
  so_harian: {
    icon: ClipboardList,
    gradient: 'from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    highlights: [
      'Pencatatan stock opname fisik harian perlengkapan dan peralatan',
      'Sinkronisasi otomatis dengan data keluar gudang dari Monitoring SLA',
      'Deteksi selisih fisik vs sistem dengan kalkulasi otomatis',
    ],
    tips: 'Sumber data RO otomatis menarik angka riil dari item yang selesai dikirim di sistem.',
  },
  assets_tracking: {
    icon: Package,
    gradient: 'from-cyan-500/20 to-sky-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
    badgeColor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    highlights: [
      'Lacak seluruh aset, nomor serial, dan kondisi operasional',
      'Cari aset per cabang outlet dengan filter multi-kolom cepat',
      'Lihat riwayat pemindahan aset dan perubahan status',
    ],
    tips: 'Klik salah satu baris aset untuk membuka rincian spesifikasi dan histori pergerakan.',
  },
  assets_input: {
    icon: PlusCircle,
    gradient: 'from-teal-500/20 to-emerald-500/20 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    badgeColor: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    highlights: [
      'Formulir terpadu penambahan aset baru ke database',
      'Pilih katalog master barang dan hubungkan ke cabang penerima',
      'Validasi otomatis nomor serial dan kode unik aset',
    ],
    tips: 'Pastikan data cabang dan tanggal perolehan diisi akurat agar pelacakan rapi.',
  },
  kelola_ro: {
    icon: GitPullRequest,
    gradient: 'from-violet-500/20 to-purple-500/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800',
    badgeColor: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    highlights: [
      'Pantau alur 9 tahap permohonan Release Order (RO) cabang',
      'Verifikasi ketersediaan stok gudang vs permohonan baru',
      'Integrasi status approval langsung ke penerbitan pengiriman',
    ],
    tips: 'Gunakan fitur ini untuk memeriksa permintaan mendesak sebelum membuat surat jalan.',
  },
  purchase_pr: {
    icon: ShoppingCart,
    gradient: 'from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    highlights: [
      'Pantau Purchase Requisition (PR) untuk pengadaan ke vendor luar',
      'Monitor estimasi tiba barang dan perbandingan harga vendor',
      'Sinkronisasi pengadaan yang siap dimasukkan ke stok gudang',
    ],
    tips: 'Status PR yang selesai otomatis memudahkan pemenuhan RO yang tertunda.',
  },
  surat_jalan: {
    icon: Truck,
    gradient: 'from-indigo-500/20 to-blue-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
    badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    highlights: [
      'Penerbitan surat jalan armada pengiriman antar outlet',
      'Daftar item siap kirim otomatis diisolasi ke Dokumen Distribusi',
      'Tombol cetak surat jalan standar pengiriman resmi',
    ],
    tips: 'Item yang sudah dikirim akan keluar dari daftar dokumen dan masuk ke evaluasi SLA.',
  },
  monitoring_transfer: {
    icon: ArrowLeftRight,
    gradient: 'from-sky-500/20 to-blue-500/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800',
    badgeColor: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    highlights: [
      'Pantau pergerakan fisik aset dalam perjalanan antar gudang/cabang',
      'Konfirmasi penerimaan barang oleh PIC outlet tujuan',
      'Pencatatan berita acara serah terima aset digital',
    ],
    tips: 'Pastikan PIC outlet menekan konfirmasi terima begitu fisik barang sampai di lokasi.',
  },
  monitoring_sla: {
    icon: Clock,
    gradient: 'from-rose-500/20 to-pink-500/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    highlights: [
      'Ukur ketepatan waktu pengiriman vs tanggal permintaan RO',
      'Indikator On-Time Delivery dan analisa keterlambatan armada',
      'Basis data perhitungan pemakaian stok keluar gudang',
    ],
    tips: 'Modul ini menjadi tolak ukur performa tim logistik dalam melayani cabang.',
  },
  master_items: {
    icon: Boxes,
    gradient: 'from-fuchsia-500/20 to-purple-500/20 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-800',
    badgeColor: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300',
    highlights: [
      'Katalog standarisasi nama barang, kategori, dan spesifikasi',
      'Mencegah duplikasi nama barang perlengkapan & peralatan',
      'Manajemen unit satuan dan klasifikasi kebutuhan cabang',
    ],
    tips: 'Pastikan nama item konsisten agar sinkronisasi dan pencarian tetap akurat.',
  },
  master_outlets: {
    icon: Store,
    gradient: 'from-emerald-500/20 to-green-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    highlights: [
      'Daftar lengkap cabang outlet aktif dan rencana pembukaan baru',
      'Atur target tanggal opening cabang dan PIC penanggung jawab',
      'Pemetaan regional untuk distribusi terfokus',
    ],
    tips: 'Update target tanggal opening untuk memicu perhitungan mundur H-3 dan H-7 otomatis.',
  },
  user_management: {
    icon: Users,
    gradient: 'from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    highlights: [
      'Khusus Super User: Atur akun pengguna dan hak akses aplikasi',
      'Batasi fitur per pengguna agar fokus pada tugas operasionalnya',
      'Preset cepat: Staff Logistik, Outlet Manager, atau Kustom',
    ],
    tips: 'Menu yang tidak dicentang di sini otomatis tersembunyi dari sidebar pengguna.',
  },
  trash_audit: {
    icon: Trash2,
    gradient: 'from-slate-500/20 to-gray-500/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
    badgeColor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    highlights: [
      'Audit log riwayat penghapusan data dan pemulihan (restore)',
      'Perlindungan data dari ketidaksengajaan hapus',
      'Pelacakan jejak aktivitas pengguna untuk akuntabilitas',
    ],
    tips: 'Data yang terhapus dapat dikembalikan ke sistem tanpa hilang permanen.',
  },
};

export function FirstTimeTutorialModal({ isOpen, onClose, onComplete }: TutorialModalProps) {
  const { user, isSuperUser, canAccessFeature } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  // Filter features permitted for this user
  const allowedFeatures = useMemo(() => {
    return APP_FEATURES.filter((f) => canAccessFeature(f.id));
  }, [canAccessFeature, user]);

  // Total slides = Welcome (1) + Features (N) + Finish (1)
  const totalSlides = 1 + allowedFeatures.length + 1;

  // Reset to step 0 when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentStep((prev) => Math.min(prev + 1, totalSlides - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalSlides]);

  if (!isOpen || !user) return null;

  const handleDismiss = () => {
    try {
      if (user?.email) {
        localStorage.setItem(`ca_tutorial_seen_${user.email}`, 'true');
      }
    } catch (e) {}
    onClose();
    if (onComplete) onComplete();
  };

  const handleNext = () => {
    if (currentStep < totalSlides - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const isWelcomeSlide = currentStep === 0;
  const isFinishSlide = currentStep === totalSlides - 1;
  const currentFeatureIndex = currentStep - 1;
  const currentFeature: AppFeature | undefined = !isWelcomeSlide && !isFinishSlide ? allowedFeatures[currentFeatureIndex] : undefined;
  const featureMeta = currentFeature ? FEATURE_META[currentFeature.id] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-300 max-h-[90vh]"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <BookOpen className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Panduan Memulai &bull; Langkah {currentStep + 1} dari {totalSlides}
            </span>
          </div>

          <button
            onClick={handleDismiss}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800 transition flex items-center gap-1"
            title="Lewati Tutorial (Esc)"
          >
            <span>Lewati</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 overflow-y-auto flex-1 min-h-[360px] flex flex-col justify-center">
          {/* SLIDE 0: WELCOME */}
          {isWelcomeSlide && (
            <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-purple-500/25">
                <Sparkles className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Selamat Datang di HANTARAN
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Halo, {user.full_name || user.username || 'Pengguna'}! 👋
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  Ini adalah tur pengenalan singkat sistem inventaris dan logistik. Menu di sidebar Anda telah disesuaikan dengan hak akses yang diberikan.
                </p>
              </div>

              {/* User Role Card */}
              <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-left space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Peran Anda:</span>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {user.role}
                  </span>
                </div>

                {user.outlet_assigned && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Penugasan Outlet:</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {user.outlet_assigned}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Fitur Siap Digunakan:</span>
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                    {allowedFeatures.length} Modul Terbuka
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 1..N: FEATURE TOUR */}
          {currentFeature && featureMeta && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm ${featureMeta.gradient}`}>
                    <featureMeta.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${featureMeta.badgeColor}`}>
                      {currentFeature.group}
                    </span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                      {currentFeature.name}
                    </h3>
                  </div>
                </div>

                <Link
                  href={currentFeature.href}
                  onClick={handleDismiss}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline w-fit px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/60"
                >
                  <span>Buka Halaman</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {currentFeature.description}
              </p>

              {/* Feature Highlights */}
              <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Fungsi & Kemampuan Utama:
                </div>
                <div className="space-y-2">
                  {featureMeta.highlights.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pro Tip */}
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="font-bold">Tips Penggunaan: </span>
                  <span>{featureMeta.tips}</span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE TERAKHIR: FINISH / CELEBRATION */}
          {isFinishSlide && (
            <div className="space-y-6 text-center animate-in zoom-in-95 duration-200">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-500/25">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Semua Siap!
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Anda Siap Mulai Bekerja
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  Semua menu yang dibuka dapat diakses langsung dari Sidebar sebelah kiri. Jika sewaktu-waktu membutuhkan panduan ini lagi, klik tombol <span className="font-bold text-purple-600 dark:text-purple-400">? Panduan</span> di navigasi atas.
                </p>
              </div>

              <div className="max-w-md mx-auto p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-800 dark:text-purple-300 text-left flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>
                  Membutuhkan akses ke fitur lain? Hubungi <strong>Super User</strong> untuk membuka hak akses fitur tambahan pada akun Anda.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
          {/* Progress Dots */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-[200px] sm:max-w-xs py-1">
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  currentStep === idx
                    ? 'w-6 bg-purple-600 dark:bg-purple-500'
                    : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-purple-300'
                }`}
                title={`Lompat ke langkah ${idx + 1}`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {!isWelcomeSlide && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition flex items-center gap-1.5 active:scale-95"
            >
              <span>{isFinishSlide ? 'Mulai Sekarang' : isWelcomeSlide ? 'Mulai Tur' : 'Lanjut'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
