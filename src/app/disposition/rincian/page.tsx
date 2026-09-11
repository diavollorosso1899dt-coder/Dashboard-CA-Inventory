import React from 'react';
import DispositionDetailView from '@/components/disposition/DispositionDetailView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Rincian Formulir Disposisi | Dashboard CA & Inventory',
  description: 'Arsip rincian seluruh dokumen pengembalian aset, riwayat perbaikan, dan disposisi afkir',
};

export default function DispositionRincianPage() {
  return <DispositionDetailView />;
}
