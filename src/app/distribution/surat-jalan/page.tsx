import React from 'react';
import SuratJalanListView from '@/components/distribution/SuratJalanListView';

export const metadata = {
  title: 'Surat Jalan (SJ) & Ekspedisi | Dashboard CA & Inventory',
  description: 'Daftar dan cetak Surat Jalan resmi pengiriman aset ke outlet',
};

export default function SuratJalanPage() {
  return <SuratJalanListView isHistoryOnly={false} />;
}
