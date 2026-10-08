'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle,
  Package,
  UserCheck,
  Truck,
  Clock,
  ShieldCheck,
  FileCheck2
} from 'lucide-react';
import { SpeedingCarLogo } from '@/components/common/SpeedingCarLogo';
import { LogisticsIllustration } from '@/components/auth/LogisticsIllustration';

export default function LoginPage() {
  const router = useRouter();
  const { login, quickLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      router.push('/');
    } else {
      setErrorMsg(result.error || 'Login gagal, periksa username dan password Anda.');
    }
    setLoading(false);
  };

  const handleDemoSelect = (role: 'super_user' | 'user' | 'outlet_manager') => {
    setErrorMsg('');
    quickLogin(role);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#f8fafd] dark:bg-[#131314] text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors">
      <div className="w-full max-w-5xl rounded-3xl bg-white dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
        
        {/* LEFT COLUMN: HERO ILLUSTRATION & LOGISTICS BRANDING (APPLICATION BLUE THEME) */}
        <div className="lg:col-span-7 bg-gradient-to-br from-[#eff6ff] via-[#f0f4f9] to-[#dbeafe]/40 dark:from-[#1b2230] dark:via-[#181a1d] dark:to-[#0f172a] p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#e0e2ec] dark:border-[#444746] relative overflow-hidden">
          
          {/* Subtle Ambient Background Accents */}
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-[#0b57d0]/10 dark:bg-[#a8c7fa]/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#2563eb]/10 dark:bg-[#004a77]/20 blur-3xl pointer-events-none" />

          {/* Top Header Badge */}
          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-[#282a2c] border border-[#c2e7ff] dark:border-[#004a77] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0b57d0] dark:text-[#a8c7fa]">
                Sistem Logistik &amp; Distribusi Aset Terpadu
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-[#1f1f1f] dark:text-white leading-tight tracking-tight">
              Monitoring Distribusi &amp; Pergudangan Logistik Cepat
            </h2>
            <p className="text-xs sm:text-sm text-[#444746] dark:text-[#c4c7c5] max-w-md">
              Kelola alur Request Order (RO), pengadaan PR vendor, penerbitan Surat Jalan, hingga SLA pemenuhan cabang secara real-time.
            </p>
          </div>

          {/* Center: Vector Illustration Matching User Concept & App Colors */}
          <div className="relative z-10 my-6 flex items-center justify-center">
            <div className="w-full max-w-[460px] drop-shadow-md">
              <LogisticsIllustration className="w-full h-auto max-h-[300px] sm:max-h-[340px]" />
            </div>
          </div>

          {/* Bottom Highlights Pills */}
          <div className="relative z-10 grid grid-cols-3 gap-2.5 pt-2 border-t border-[#e0e2ec]/80 dark:border-[#333538]">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/80 dark:bg-[#282a2c]/80 border border-[#e0e2ec] dark:border-[#444746]">
              <div className="p-1.5 rounded-lg bg-[#d3e3fd] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] shrink-0">
                <FileCheck2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">Kelola RO</div>
                <div className="text-[9px] text-[#747775] dark:text-[#8e918f]">Alur Stok &amp; PR</div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/80 dark:bg-[#282a2c]/80 border border-[#e0e2ec] dark:border-[#444746]">
              <div className="p-1.5 rounded-lg bg-[#c4eed0] dark:bg-[#0f5223] text-[#137333] dark:text-[#6dd58c] shrink-0">
                <Truck className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">Surat Jalan</div>
                <div className="text-[9px] text-[#747775] dark:text-[#8e918f]">Cetak Otomatis</div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/80 dark:bg-[#282a2c]/80 border border-[#e0e2ec] dark:border-[#444746]">
              <div className="p-1.5 rounded-lg bg-[#feeed9] dark:bg-[#4a2800] text-[#b06000] dark:text-[#ffb951] shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">SLA Lead Time</div>
                <div className="text-[9px] text-[#747775] dark:text-[#8e918f]">On-Time Target</div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: LOGIN FORM (GOOGLE M3 DESIGN) */}
        <div className="lg:col-span-5 p-6 sm:p-10 flex flex-col justify-between space-y-6">
          
          {/* Brand Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#0b57d0] dark:bg-[#a8c7fa] text-white dark:text-[#041e49] shadow-lg shadow-[#0b57d0]/25">
                <SpeedingCarLogo className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#1f1f1f] dark:text-white uppercase leading-none">
                  HANTARAN
                </h1>
                <p className="text-[11px] text-[#747775] dark:text-[#8e918f] font-semibold mt-1">
                  Coffee Arabica Inventory &amp; Logistics
                </p>
              </div>
            </div>

            <div className="pt-2">
              <h2 className="text-lg font-bold text-[#1f1f1f] dark:text-white">
                Masuk ke Akun Anda
              </h2>
              <p className="text-xs text-[#747775] dark:text-[#8e918f] mt-0.5">
                Masukkan kredensial akun untuk mengakses seluruh fitur operasional
              </p>
            </div>
          </div>

          {/* Form Area */}
          <div className="space-y-4">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleManualLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1.5">
                  Email / Username
                </label>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#747775]" />
                  <input
                    type="text"
                    required
                    placeholder="nama@coffee-arabica.co.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] text-[#1f1f1f] dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/20 focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] transition font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#444746] dark:text-[#c4c7c5] uppercase tracking-wider mb-1.5">
                  Kata Sandi (Password)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#747775]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] text-[#1f1f1f] dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/20 focus:border-[#0b57d0] dark:focus:border-[#a8c7fa] transition font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1f1f1f] dark:hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-[#0b57d0] hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] text-white dark:text-[#041e49] font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-[#0b57d0]/25 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Quick Demo Login Shortcuts */}
          <div className="pt-2 border-t border-[#e0e2ec] dark:border-[#444746] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#747775] dark:text-[#8e918f]">
              <span className="font-semibold uppercase tracking-wider">Akses Cepat Pengujian:</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleDemoSelect('super_user')}
                className="px-2 py-1.5 rounded-lg border border-[#c2e7ff] dark:border-[#004a77] bg-[#eff6ff] dark:bg-[#004a77]/30 hover:bg-[#d3e3fd] text-[10px] font-bold text-[#0b57d0] dark:text-[#a8c7fa] transition-colors truncate"
                title="Login sebagai Super User / Admin"
              >
                Super User
              </button>
              <button
                type="button"
                onClick={() => handleDemoSelect('user')}
                className="px-2 py-1.5 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[10px] font-bold text-[#444746] dark:text-[#c4c7c5] transition-colors truncate"
                title="Login sebagai Tim Logistik SCGA"
              >
                Logistik
              </button>
              <button
                type="button"
                onClick={() => handleDemoSelect('outlet_manager')}
                className="px-2 py-1.5 rounded-lg border border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#282a2c] hover:bg-[#e0e2ec] dark:hover:bg-[#333537] text-[10px] font-bold text-[#444746] dark:text-[#c4c7c5] transition-colors truncate"
                title="Login sebagai Outlet Manager"
              >
                Store Mgr
              </button>
            </div>
          </div>

          {/* Footer Copyright */}
          <div className="text-center pt-2">
            <p className="text-[11px] text-[#747775] dark:text-[#8e918f]">
              &copy; {new Date().getFullYear()} <strong>HANTARAN</strong> &bull; Coffee Arabica Logistics System
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
