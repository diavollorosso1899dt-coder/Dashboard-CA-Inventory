'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { 
  LayoutDashboard, 
  Layers,
  ArrowRightLeft,
  PlusCircle,
  Truck,
  FileCheck2,
  Clock,
  RotateCcw,
  Users,
  Store,
  RefreshCw,
  ChevronDown,
  Activity,
  Printer,
  LogOut
} from 'lucide-react';

import { useNavigation } from './NavigationContext';
import { useAuth } from '@/components/auth/AuthContext';

interface SubMenuItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface MenuGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  items: SubMenuItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobileOpen, closeMobile } = useNavigation();
  const { user, logout } = useAuth();
  const regionQuery = searchParams.get('region') ? `?region=${searchParams.get('region')}` : '';

  const menuGroups: MenuGroup[] = [
    {
      title: 'Monitoring',
      icon: Layers,
      color: 'text-purple-600 dark:text-purple-400',
      items: [
        { name: 'Daftar Aset', href: '/monitoring/assets', icon: Layers },
        { name: 'Transfer Aset', href: '/monitoring/transfer', icon: ArrowRightLeft },
        { name: 'Input Aset Baru', href: '/monitoring/input', icon: PlusCircle },
      ],
    },
    {
      title: 'Distribusi',
      icon: Truck,
      color: 'text-blue-600 dark:text-blue-400',
      items: [
        { name: 'Kelola RO', href: '/distribution/ro', icon: FileCheck2 },
        { name: 'Surat Jalan (SJ)', href: '/distribution/surat-jalan', icon: Printer },
        { name: 'Riwayat SJ', href: '/distribution/surat-jalan/history', icon: Truck },
        { name: 'Monitoring SLA', href: '/distribution/sla', icon: Clock },
      ],
    },
    {
      title: 'Disposisi',
      icon: RotateCcw,
      color: 'text-emerald-600 dark:text-emerald-400',
      items: [
        { name: 'Form Pengembalian', href: '/disposition/return-form', icon: PlusCircle },
        { name: 'Monitoring Status', href: '/disposition/status', icon: Activity },
      ],
    },
    {
      title: 'Pengguna & Outlet',
      icon: Users,
      color: 'text-amber-600 dark:text-amber-400',
      items: [
        { name: 'Kelola User', href: '/users', icon: Users },
        { name: 'Daftar Outlet', href: '/outlets', icon: Store },
      ],
    },
  ];

  // Auto expand groups that contain the active route
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Monitoring: true,
    Distribusi: true,
    Disposisi: true,
    'Pengguna & Outlet': true,
  });

  useEffect(() => {
    menuGroups.forEach((group) => {
      if (group.items.some((it) => pathname === it.href || pathname.startsWith(it.href))) {
        setOpenGroups((prev) => ({ ...prev, [group.title]: true }));
      }
    });
  }, [pathname]);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Responsive Sidebar */}
      <aside
        className={`fixed left-0 top-16 z-50 md:z-20 flex h-[calc(100vh-4rem)] w-72 md:w-64 flex-col border-r border-[#e0e2ec] dark:border-[#444746] bg-[#f8fafd] dark:bg-[#131314] p-3 shadow-2xl md:shadow-none transition-transform duration-200 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <nav className="flex-1 space-y-3 overflow-y-auto pr-1">
          {/* 1. Main Dashboard Link */}
          <div>
            <Link
              href={`/${regionQuery}`}
              onClick={closeMobile}
              className={`flex items-center gap-3 rounded-full px-3.5 py-2.5 text-xs font-semibold transition-all ${
                pathname === '/'
                  ? 'bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-sm'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] hover:text-[#1f1f1f] dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0 text-[#0b57d0] dark:text-[#a8c7fa]" />
              <span>Ringkasan Eksekutif</span>
            </Link>
          </div>

          {/* 2. Accordion Groups from Mind Map */}
          {menuGroups.map((group) => {
            const isOpen = openGroups[group.title] ?? true;
            const GroupIcon = group.icon;
            const hasActiveChild = group.items.some(
              (it) => pathname === it.href || pathname.startsWith(it.href)
            );

            return (
              <div key={group.title} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-lg ${
                    hasActiveChild
                      ? 'text-[#0b57d0] dark:text-[#a8c7fa]'
                      : 'text-[#747775] dark:text-[#8e918f] hover:text-[#1f1f1f] dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon className={`h-3.5 w-3.5 ${group.color}`} />
                    <span>{group.title}</span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-0.5 pl-2 border-l border-[#e0e2ec] dark:border-[#444746] ml-2">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.href}
                          href={`${item.href}${regionQuery}`}
                          onClick={closeMobile}
                          className={`group flex items-center justify-between rounded-full px-3 py-2 text-xs transition-all ${
                            isActive
                              ? 'bg-[#c2e7ff] text-[#001d35] font-semibold dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-xs'
                              : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] hover:text-[#1f1f1f] dark:hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <Icon
                              className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                                isActive
                                  ? 'text-[#001d35] dark:text-[#c2e7ff]'
                                  : 'text-[#747775] dark:text-[#8e918f] group-hover:text-[#1f1f1f] dark:group-hover:text-white'
                              }`}
                            />
                            <span className="truncate">{item.name}</span>
                          </div>

                          {item.badge && (
                            <span className="rounded-full bg-[#e8f0fe] dark:bg-[#004a77] px-2 py-0.5 text-[10px] font-bold text-[#0b57d0] dark:text-[#c2e7ff]">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 3. Sistem & Integrasi */}
          <div className="pt-2 border-t border-[#e0e2ec] dark:border-[#444746]">
            <Link
              href={`/sync${regionQuery}`}
              onClick={closeMobile}
              className={`flex items-center gap-3 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                pathname === '/sync'
                  ? 'bg-[#c2e7ff] text-[#001d35] dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-sm'
                  : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] hover:text-[#1f1f1f] dark:hover:text-white'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#747775] dark:text-[#8e918f]" />
              <span>Sinkronisasi Google Sheets</span>
            </Link>
          </div>

          {/* 4. Active User Card & Logout */}
          {user && (
            <div className="pt-2 border-t border-[#e0e2ec] dark:border-[#444746]">
              <div className="p-2.5 rounded-2xl bg-white dark:bg-[#1e1f20] border border-[#e0e2ec] dark:border-[#444746] flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#0b57d0] text-white font-bold flex items-center justify-center text-xs shrink-0">
                    {user.full_name ? user.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() : 'CA'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1f1f1f] dark:text-[#e3e3e3] truncate">
                      {user.full_name}
                    </div>
                    <div className="text-[10px] text-[#747775] dark:text-[#8e918f] truncate">
                      {user.role}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  title="Keluar / Logout"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
