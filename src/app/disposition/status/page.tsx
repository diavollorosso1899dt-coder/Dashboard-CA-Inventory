import React from 'react';
import DispositionStatusView from '@/components/disposition/DispositionStatusView';

export const metadata = {
  title: 'Monitoring Disposisi & Retur | Dashboard CA & Inventory',
  description: 'Pelacakan status pengembalian, perbaikan, dan disposisi scrap aset',
};

export default function DispositionStatusPage() {
  return <DispositionStatusView />;
}
