import React from 'react';
import SuratJalanListView from '@/components/distribution/SuratJalanListView';

export const metadata = {
  title: 'Riwayat Surat Jalan Selesai | Dashboard CA & Inventory',
  description: 'Arsip pengiriman surat jalan yang telah rampung dan diterima cabang',
};

export default function SuratJalanHistoryPage() {
  return <SuratJalanListView isHistoryOnly={true} />;
}
