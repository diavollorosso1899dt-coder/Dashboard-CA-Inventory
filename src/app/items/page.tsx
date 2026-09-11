import React from 'react';
import { getMasterAssetCatalog } from '@/lib/supabase/server';
import ItemMasterView from '@/components/items/ItemMasterView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kelola Item & Master Aset | Dashboard CA & Inventory',
  description: 'Daftar item baru dan master katalog aset standar Coffee Arabica (CA) dengan gambar dan spesifikasi',
};

export default async function ItemsPage() {
  const catalog = await getMasterAssetCatalog();

  return <ItemMasterView initialItems={catalog} />;
}
