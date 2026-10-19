'use client';

import React, { Suspense, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useNavigation } from './NavigationContext';
import { useAuth } from '@/components/auth/AuthContext';
import { FirstTimeTutorialModal } from '@/components/tutorial/FirstTimeTutorialModal';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const { user } = useAuth();
  const { isTutorialOpen, openTutorial, closeTutorial } = useNavigation();

  // Auto-trigger tutorial on first-time login
  useEffect(() => {
    if (user && user.email) {
      try {
        const seen = localStorage.getItem(`ca_tutorial_seen_${user.email}`);
        if (!seen) {
          openTutorial();
        }
      } catch (e) {}
    }
  }, [user?.email, openTutorial]);

  if (isLoginPage) {
    return <AuthGuard>{children}</AuthGuard>;
  }

  return (
    <AuthGuard>
      <Suspense fallback={<div className="h-16 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800" />}>
        <Navbar />
      </Suspense>
      <div className="flex w-full">
        <Suspense fallback={<div className="hidden md:block w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 md:ml-64 w-full min-w-0 min-h-[calc(100vh-4rem)] p-4 md:p-6 lg:p-8 bg-slate-50 dark:bg-[#090d16] transition-colors duration-200">
          <div className="mx-auto max-w-7xl w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Onboarding & Feature Tutorial Modal */}
      <FirstTimeTutorialModal
        isOpen={isTutorialOpen}
        onClose={closeTutorial}
        onComplete={closeTutorial}
      />
    </AuthGuard>
  );
}

