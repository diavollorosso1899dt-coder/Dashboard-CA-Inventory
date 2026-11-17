import React from 'react';
import { TrashAndLogView } from '@/components/audit/TrashAndLogView';
import { getTrashItems, getAuditLogs } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Manajemen Sampah & Audit Log | HANTARAN Inventory',
  description: 'Pengelolaan data terhapus (Recycle Bin) dan riwayat perubahan audit trail sistem HANTARAN',
};

export default async function TrashPage() {
  const trashItems = await getTrashItems();
  const { data: auditLogs, total: auditLogTotal } = await getAuditLogs({ limit: 1000 });

  return <TrashAndLogView initialTrash={trashItems} initialLogs={auditLogs} initialLogTotal={auditLogTotal} />;
}
