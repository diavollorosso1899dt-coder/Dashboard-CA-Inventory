import React from 'react';
import { StockOpnameView } from '@/components/so-harian/StockOpnameView';

export const metadata = {
  title: 'Stock Opname Harian | Dashboard CA',
  description: 'Sistem rekonsiliasi stok harian fisik vs sistem untuk kategori Peralatan dan Perlengkapan Tetap',
};

export default function StockOpnamePage() {
  return <StockOpnameView />;
}
