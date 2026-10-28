import React from 'react';
import { getPurchaseRequirementHistory } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import PurchaseRequirementView from '@/components/distribution/PurchaseRequirementView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Riwayat PR | Dashboard CA & Inventory',
  description: 'Arsip aset yang telah selesai diproses melalui Purchase Requirement',
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function PurchaseRequirementHistoryPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';
  const historyItems = await getPurchaseRequirementHistory(region);

  return <PurchaseRequirementView initialItems={historyItems} region={region} mode="history" />;
}
