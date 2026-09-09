import React from 'react';
import RoManagerView from '@/components/distribution/RoManagerView';
import { getRequestOrders, getOutlets } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kelola Request Order (RO) | Dashboard CA & Inventory',
  description: 'Manajemen permohonan pengadaan dan distribusi aset cabang ke gudang pusat',
};

export default async function RoPage() {
  const [initialOrders, outlets] = await Promise.all([
    getRequestOrders(),
    getOutlets(),
  ]);
  return <RoManagerView initialOrders={initialOrders} outlets={outlets} />;
}
