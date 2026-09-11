import React from 'react';
import { getPurchaseRequirementItems } from '@/lib/supabase/server';
import { RegionType } from '@/lib/supabase/types';
import PurchaseRequirementView from '@/components/distribution/PurchaseRequirementView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Purchase Requirement (PR) | Dashboard CA & Inventory',
  description: 'Input tanggal permintaan aset dan monitoring status pengadaan PR vendor',
};

interface PageProps {
  searchParams: Promise<{ region?: string; tab?: string }>;
}

export default async function PurchaseRequirementPage({ searchParams }: PageProps) {
  const { region: rawRegion } = await searchParams;
  const region = (rawRegion as RegionType) || 'ALL';
  const prItems = await getPurchaseRequirementItems(region);

  return <PurchaseRequirementView initialItems={prItems} region={region} />;
}
