import React from 'react';
import SuratJalanListView from '@/components/distribution/SuratJalanListView';

export const metadata = {
  title: 'Riwayat & Tracking Surat Jalan | Dashboard CA & Inventory',
  description: 'Arsip riwayat penerbitan dan timeline tracking surat jalan armada ke cabang',
};

export default function SuratJalanHistoryPage() {
  return <SuratJalanListView isHistoryOnly={true} />;
}
