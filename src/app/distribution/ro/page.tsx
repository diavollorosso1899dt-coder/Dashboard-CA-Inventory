import React from 'react';
import RoManagerView from '@/components/distribution/RoManagerView';
import { getRequestOrders, getOutlets } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kelola Request Order (RO) | Dashboard CA & Inventory',
  description: 'Manajemen permohonan pengadaan dan distribusi aset cabang ke gudang pusat',
};

export default async function RoPage() {
  const [orders, outlets] = await Promise.all([
    getRequestOrders(),
    getOutlets(),
  ]);

  // Hanya sertakan dokumen RO yang masih aktif (belum dialokasikan ke Ready Stock / PR)
  const activeOrders = orders.filter((o) => {
    if (o.notes && o.notes.includes('[PROCESSED_FROM_RO]')) return false;
    const stage = o.current_stage || o.status;
    if (
      stage === 'SURAT_JALAN' ||
      stage === 'IN_DELIVERY' ||
      stage === 'KELOLA_PR' ||
      stage === 'NEED_PR' ||
      stage === 'READY_STOCK' ||
      stage === 'ASET_SAMPAI' ||
      stage === 'CHECKLIST' ||
      stage === 'CHECKLIST_DONE' ||
      stage === 'UPDATE_SLA' ||
      stage === 'SELESAI' ||
      stage === 'COMPLETED'
    ) {
      return false;
    }
    return true;
  });

  return <RoManagerView initialOrders={activeOrders} outlets={outlets} />;
}
