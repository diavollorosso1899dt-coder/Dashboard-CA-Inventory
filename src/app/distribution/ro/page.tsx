import React from 'react';
import RoManagerView from '@/components/distribution/RoManagerView';
import { getRequestOrders, getOutlets } from '@/lib/supabase/server';
import { isRoFinalizedForActiveList } from '@/lib/distribution/ro-visibility';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kelola Request Order (RO) | Dashboard CA & Inventory',
  description: 'Manajemen permohonan pengadaan dan distribusi aset cabang ke gudang pusat',
};

export default async function RoPage() {
  const [orders, outlets] = await Promise.all([
    getRequestOrders(true),
    getOutlets(),
  ]);

  // RO yang itemnya sudah dialokasikan (Ready Stock / PR) tetap tampil.
  // Hanya RO final (selesai/dibatalkan) yang keluar dari daftar aktif.
  const activeOrders = orders.filter((o) => !isRoFinalizedForActiveList(o));

  return <RoManagerView initialOrders={activeOrders} outlets={outlets} />;
}
