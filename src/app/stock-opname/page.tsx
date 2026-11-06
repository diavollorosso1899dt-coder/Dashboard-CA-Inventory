import React from 'react';
import { StockOpnameView } from '@/components/so-harian/StockOpnameView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Stock Opname Harian | Dashboard CA',
  description:
    'Sistem rekonsiliasi stok harian fisik vs sistem per region untuk kategori Peralatan dan Perlengkapan Tetap',
};

interface PageProps {
  searchParams: Promise<{ region?: string }>;
}

export default async function StockOpnamePage({ searchParams }: PageProps) {
  const { region } = await searchParams;
  return <StockOpnameView initialRegion={region ?? null} />;
}
