import React from 'react';
import OutletManagerView from '@/components/outlets/OutletManagerView';

export const metadata = {
  title: 'Master Data Outlet | Dashboard CA & Inventory',
  description: 'Daftar cabang, regional, PIC, dan status kesiapan operasional outlet',
};

export default function OutletsPage() {
  return <OutletManagerView />;
}
