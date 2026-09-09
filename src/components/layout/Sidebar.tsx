'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { 
  LayoutDashboard, 
  Store, 
  Clock, 
  TableProperties, 
  RefreshCw
} from 'lucide-react';

import { useNavigation } from './NavigationContext';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const navItems: NavItem[] = [
  {
    name: 'Ringkasan Eksekutif',
    href: '/',
    icon: LayoutDashboard,
    description: 'Statistik & jadwal opening outlet',
  },
  {
    name: 'Kesiapan Outlet Baru',
    href: '/opening-readiness',
    icon: Store,
    description: 'Progres kelengkapan aset per cabang',
  },
  {
    name: 'SLA & Lead Time',
    href: '/sla-analytics',
    icon: Clock,
    description: 'Analisis durasi waktu pengadaan',
  },
  {
    name: 'Pelacakan & Editor Aset',
    href: '/asset-tracker',
    icon: TableProperties,
    description: 'Master data, No RAB, dan status',
  },
  {
    name: 'Sinkronisasi Database',
    href: '/sync',
    icon: RefreshCw,
    description: 'Sinkronisasi Google Sheets',
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobileOpen, closeMobile } = useNavigation();
  const regionQuery = searchParams.get('region') ? `?region=${searchParams.get('region')}` : '';

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
        <div className="mb-2 px-3 pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#444746] dark:text-[#c4c7c5]">
            Menu Utama
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={`${item.href}${regionQuery}`}
                onClick={closeMobile}
                className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-xs transition-all ${
                  isActive
                    ? 'bg-[#c2e7ff] text-[#001d35] font-semibold dark:bg-[#004a77] dark:text-[#c2e7ff] shadow-sm'
                    : 'text-[#444746] dark:text-[#c4c7c5] hover:bg-[#e9eef6] dark:hover:bg-[#282a2c] hover:text-[#1f1f1f] dark:hover:text-white'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive
                      ? 'text-[#001d35] dark:text-[#c2e7ff]'
                      : 'text-[#444746] dark:text-[#c4c7c5] group-hover:text-[#1f1f1f] dark:group-hover:text-white'
                  }`}
                />
                <div className="truncate">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-[10px] text-[#747775] dark:text-[#8e918f] truncate">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
