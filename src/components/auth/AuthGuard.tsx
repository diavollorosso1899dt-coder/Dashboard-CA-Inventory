import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, canAccessFeature } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated && !isLoginPage) {
        router.push('/login');
      } else if (isAuthenticated && isLoginPage) {
        router.push('/');
      }
    }
  }, [isLoading, isAuthenticated, isLoginPage, router]);

  // If loading session, show animated splash
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8fafd] dark:bg-[#090d16] text-slate-800 dark:text-slate-200">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
          <Loader2 className="h-6 w-6 animate-spin text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span className="text-sm font-semibold tracking-tight">Memverifikasi Sesi Akses...</span>
        </div>
      </div>
    );
  }

  // If on login page and not authenticated, render login page directly
  if (isLoginPage) {
    return <>{children}</>;
  }

  // If not authenticated and not on login page, wait for redirect
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafd] dark:bg-[#090d16]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0b57d0]" />
      </div>
    );
  }

  // Check if current user is permitted to access this feature/route
  const hasAccess = canAccessFeature(pathname);
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center animate-fade-in">
        <div className="p-4 bg-rose-100/80 dark:bg-rose-950/40 rounded-2xl text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 mb-4 shadow-sm">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Akses Fitur Dibatasi oleh Super User
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
          Fitur ini belum dibuka oleh <strong>Super User</strong> untuk akun Anda ({user?.full_name || 'User'}).
          Silakan gunakan menu fitur yang aktif di Sidebar atau hubungi Super User/Administrator untuk membuka akses fitur ini.
        </p>
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold hover:opacity-90 transition shadow-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Halaman Utama</span>
        </button>
      </div>
    );
  }

  // Authenticated and authorized
  return <>{children}</>;
}
