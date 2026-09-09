import React from 'react';
import ReturnAssetForm from '@/components/disposition/ReturnAssetForm';

export const metadata = {
  title: 'Form Pengembalian Aset | Dashboard CA & Inventory',
  description: 'Formulir pengajuan retur dan disposisi aset dari outlet ke gudang pusat',
};

export default function ReturnFormPage() {
  return <ReturnAssetForm />;
}
