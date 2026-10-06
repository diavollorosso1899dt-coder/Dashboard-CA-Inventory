import React from 'react';
import { calculateDashboardMetrics, getAssetRequests, getRequestOrders, getBranchOpeningSummaries } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import InteractiveSlaDashboard from '@/components/sla/InteractiveSlaDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Monitoring SLA & Ketepatan Pemenuhan RO | Dashboard CA & Inventory',
  description: 'Pemantauan durasi waktu dari input order permohonan hingga barang diterima di lokasi outlet sesuai target permintaan',
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function SlaAnalyticsPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';

  const [metrics, assetResponse, roOrders, branchSummaries] = await Promise.all([
    calculateDashboardMetrics(region),
    getAssetRequests({ region, limit: 3000 }),
    getRequestOrders(),
    getBranchOpeningSummaries(region),
  ]);

  return (
    <InteractiveSlaDashboard
      initialRoOrders={roOrders}
      initialAssetRequests={assetResponse.data}
      initialBranchSummaries={branchSummaries}
      metrics={metrics}
      initialRegion={region}
    />
  );
}
