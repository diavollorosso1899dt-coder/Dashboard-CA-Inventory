import React from 'react';
import SlaAnalyticsPage from '@/app/sla-analytics/page';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Monitoring SLA Distribusi & Pengadaan | Dashboard CA & Inventory',
  description: 'Pemantauan durasi waktu SLA pemenuhan order dan distribusi logistik antar outlet',
};

export default function DistributionSlaPage(props: any) {
  return <SlaAnalyticsPage {...props} />;
}
