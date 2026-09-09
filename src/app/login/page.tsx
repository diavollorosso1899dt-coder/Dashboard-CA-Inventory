'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { 
  Database, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  Package, 
  Store, 
  AlertCircle,
  Sparkles,
  Coffee
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, quickLogin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      router.push('/');
    } else {
      setErrorMsg(result.error || 'Login gagal, periksa email dan password Anda.');
    }
    setLoading(false);
  };

  const handleQuickLogin = async (roleType: 'super_user' | 'user' | 'outlet_manager') => {
    setErrorMsg('');
    setQuickLoading(roleType);
    await quickLogin(roleType);
    setQuickLoading(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/50 dark:from-[#080c14] dark:via-[#090d16] dark:to-[#0f172a] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30">
      <div className="w-full max-w-md space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white shadow-xl shadow-indigo-600/25 mb-1">
            <Coffee className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            PT. Coffee Arabica
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            Asset Control, Logistics & Inventory Management Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Masuk ke Portal
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Gunakan akun terdaftar Anda untuk mengakses sistem
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                Username atau Alamat Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="superuser atau nama@coffee-arabica.co.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Kata Sandi (Password)
                </label>
                <span className="text-[11px] text-slate-400">Superuser: usergacor</span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <span>{loading ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Login Section */}
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Akses Cepat Pengujian (1-Click Demo)</span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('superuser');
                  setPassword('usergacor');
                  login('superuser', 'usergacor').then(res => {
                    if (res.success) router.push('/');
                  });
                }}
                disabled={quickLoading !== null}
                className="w-full p-2.5 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/60 text-left flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-purple-600 text-white">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-purple-900 dark:text-purple-300">
                      Super User (Administrator)
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      User: <strong>superuser</strong> • Pass: <strong>usergacor</strong>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold group-hover:translate-x-1 transition-transform">
                  Masuk →
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('user')}
                disabled={quickLoading !== null}
                className="w-full p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/60 text-left flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-600 text-white">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-900 dark:text-blue-300">
                      Staff Logistik & Gudang Pusat
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">logistik@coffee-arabica.co.id</div>
                  </div>
                </div>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-1 transition-transform">
                  {quickLoading === 'user' ? '...' : 'Masuk →'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('outlet_manager')}
                disabled={quickLoading !== null}
                className="w-full p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/60 text-left flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-600 text-white">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                      User Outlet Manager (Cabang Batam)
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">manager.batam@coffee-arabica.co.id</div>
                  </div>
                </div>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold group-hover:translate-x-1 transition-transform">
                  {quickLoading === 'outlet_manager' ? '...' : 'Masuk →'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} PT. Coffee Arabica Indonesia • All Rights Reserved.
        </p>
      </div>
    </div>
  );
}
