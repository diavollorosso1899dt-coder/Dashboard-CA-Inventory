import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { ThemeProvider } from '@/components/theme/ThemeContext';
import { MuiThemeRegistry } from '@/components/theme/MuiThemeRegistry';
import { Suspense } from 'react';

import { NavigationProvider } from '@/components/layout/NavigationContext';

export const metadata: Metadata = {
  title: 'Asset Control & Inventory Dashboard',
  description: 'Sistem Pemantauan Aset, Kesiapan Outlet, SLA Pengadaan & Google Sheets Sync ke Supabase',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('app-theme');
                if (saved === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                } else if (saved === 'dark') {
                  document.documentElement.classList.remove('light');
                  document.documentElement.classList.add('dark');
                } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased selection:bg-emerald-500/30 selection:text-emerald-800 dark:selection:text-emerald-200 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 min-h-screen">
        <ThemeProvider>
          <MuiThemeRegistry>
            <NavigationProvider>
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
            </NavigationProvider>
          </MuiThemeRegistry>
        </ThemeProvider>
      </body>
    </html>
  );
}
