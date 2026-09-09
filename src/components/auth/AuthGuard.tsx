'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { Loader2 } from 'lucide-react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
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

  // Authenticated user
  return <>{children}</>;
}
