'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { 
  Clock, 
  Sun, 
  Moon, 
  Database,
  Menu,
  X,
  LogOut,
  User,
  ShieldCheck,
  Store,
  Package,
  ChevronDown
} from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeContext';
import { useNavigation } from './NavigationContext';
import { useAuth } from '@/components/auth/AuthContext';

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRegion = searchParams.get('region') || 'ALL';
  const { theme, toggleTheme } = useTheme();
  const { isMobileOpen, toggleMobile } = useNavigation();
  const { user, logout } = useAuth();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Clock timer
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        new Intl.DateTimeFormat('id-ID', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta'
        }).format(now) + ' WIB'
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Silent & Resilient Auto-Sync in background (safe polling without unhandled rejections)
  useEffect(() => {
    let isMounted = true;

    // Suppress benign unhandled rejection events in browser dev mode
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        !event.reason ||
        event.reason.name === 'AbortError' ||
        event.reason.message?.includes('Failed to fetch') ||
        typeof event.reason === 'object'
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    const runBackgroundSync = async () => {
      // Don't poll if already running, or if page/tab is hidden/offline
      if (
        isSyncingRef.current || 
        !isMounted || 
        (typeof document !== 'undefined' && document.visibilityState !== 'visible') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        return;
      }

      try {
        isSyncingRef.current = true;

        const res = await fetch('/api/sync', {
          cache: 'no-store',
        }).catch(() => null);

        if (res && res.ok && isMounted) {
          const data = await res.json().catch(() => null);
          if (data && data.success && data.changed && isMounted) {
            router.refresh();
          }
        }
      } catch {
        // Silently ignore
      } finally {
        if (isMounted) {
          isSyncingRef.current = false;
        }
      }
    };

    const timer = setInterval(runBackgroundSync, 60000);
    
    return () => {
      isMounted = false;
      clearInterval(timer);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [router]);

  const handleRegionChange = (newRegion: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newRegion === 'ALL') {
      params.delete('region');
    } else {
      params.set('region', newRegion);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd]/95 dark:bg-[#131314]/95 backdrop-blur-md px-4 md:px-6 transition-colors duration-200">
      {/* Brand Title with Google Material Icon */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          onClick={toggleMobile}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] md:hidden transition-colors"
          aria-label={isMobileOpen ? 'Tutup menu' : 'Buka menu'}
          title="Menu Navigasi"
        >
          {isMobileOpen ? <X className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f0fe] dark:bg-[#004a77] text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#d3e3fd] dark:hover:bg-[#0842a0] transition-colors shadow-sm shrink-0">
          <div className="relative flex h-5 w-5 items-center justify-center">
            <Database className="h-5 w-5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          </div>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Link href="/" className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3] text-base md:text-lg tracking-tight hover:text-[#0b57d0] dark:hover:text-[#a8c7fa] transition-colors">
              Asset Control
            </Link>
            <span className="hidden sm:inline-block rounded-full bg-[#e8f0fe] dark:bg-[#004a77] px-2.5 py-0.5 text-[11px] font-medium text-[#0b57d0] dark:text-[#c2e7ff]">
              Dashboard
            </span>
          </div>
          <p className="text-[11px] text-[#444746] dark:text-[#c4c7c5] hidden sm:block">
            Monitoring SLA Pengadaan, Kesiapan Outlet, dan Tracking RAB
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time Clock Pill */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-[#e9eef6] dark:bg-[#282a2c] px-3.5 py-1.5 text-xs text-[#444746] dark:text-[#c4c7c5] font-medium">
          <Clock className="h-3.5 w-3.5 text-[#0b57d0] dark:text-[#a8c7fa]" />
          <span>{currentTime}</span>
        </div>

        {/* Google Material 3 Segmented Button for Region */}
        <div className="flex items-center rounded-full bg-[#e9eef6] dark:bg-[#282a2c] p-1 text-xs">
          <button
            onClick={() => handleRegionChange('ALL')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              currentRegion === 'ALL'
                ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => handleRegionChange('JABODETABEK')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              currentRegion === 'JABODETABEK'
                ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
            }`}
          >
            JABO
          </button>
          <button
            onClick={() => handleRegionChange('KALBAR')}
            className={`rounded-full px-3 py-1 font-medium transition-all ${
              currentRegion === 'KALBAR'
                ? 'bg-[#0b57d0] text-white shadow-sm dark:bg-[#a8c7fa] dark:text-[#041e49]'
                : 'text-[#444746] dark:text-[#c4c7c5] hover:text-[#1f1f1f] dark:hover:text-white'
            }`}
          >
            KALBAR
          </button>
        </div>

        {/* Google Material 3 Round Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] text-[#444746] dark:text-[#c4c7c5] transition-colors"
          title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-[#ffb951] transition-transform hover:rotate-45" />
          ) : (
            <Moon className="h-5 w-5 text-[#444746] transition-transform hover:-rotate-12" />
          )}
        </button>

        {/* Google User Avatar Circle & Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] transition-colors"
            title="Profil Pengguna & Logout"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#137333] text-white text-xs font-bold shadow-sm ring-2 ring-transparent hover:ring-emerald-500/50 transition-all">
              {user?.full_name 
                ? user.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() 
                : 'CA'}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-3 z-50 animate-fadeIn">
              <div className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-sm shrink-0">
                  {user?.full_name 
                    ? user.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() 
                    : 'CA'}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {user?.full_name || 'Pengguna Dashboard'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user?.email || 'user@coffee-arabica.co.id'}
                  </div>
                  <div className="mt-1">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {user?.role || 'Staff Logistik'}
                    </span>
                  </div>
                </div>
              </div>

              {user?.outlet_assigned && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300">
                  <Store className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="truncate">Penugasan: <strong>{user.outlet_assigned}</strong></span>
                </div>
              )}

              <div className="pt-1">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Keluar / Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
