import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/ThemeContext';
import { MuiThemeRegistry } from '@/components/theme/MuiThemeRegistry';
import { NavigationProvider } from '@/components/layout/NavigationContext';
import { AuthProvider } from '@/components/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';

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

              // Auto-recover from stale Webpack chunks after dev restart/rebuild
              window.addEventListener('error', function(e) {
                if (e && e.message && (e.message.indexOf('ChunkLoadError') !== -1 || e.message.indexOf('Loading chunk') !== -1)) {
                  if (!sessionStorage.getItem('chunk_retry')) {
                    sessionStorage.setItem('chunk_retry', '1');
                    window.location.reload();
                  }
                }
              });
              window.addEventListener('unhandledrejection', function(e) {
                if (e && e.reason && (e.reason.name === 'ChunkLoadError' || (e.reason.message && e.reason.message.indexOf('ChunkLoadError') !== -1))) {
                  if (!sessionStorage.getItem('chunk_retry')) {
                    sessionStorage.setItem('chunk_retry', '1');
                    window.location.reload();
                  }
                }
              });
            `,
          }}
        />
      </head>
      <body className="antialiased selection:bg-emerald-500/30 selection:text-emerald-800 dark:selection:text-emerald-200 bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 min-h-screen">
        <ThemeProvider>
          <MuiThemeRegistry>
            <AuthProvider>
              <NavigationProvider>
                <AppShell>
                  {children}
                </AppShell>
              </NavigationProvider>
            </AuthProvider>
          </MuiThemeRegistry>
        </ThemeProvider>
      </body>
    </html>
  );
}
