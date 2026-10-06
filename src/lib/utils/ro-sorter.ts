import { RequestOrder } from '@/lib/supabase/types';

/**
 * Mengurutkan dokumen Request Order (RO) secara stabil dan deterministik:
 * Data terbaru SELALU berada di urutan paling atas.
 *
 * Kriteria Pengurutan:
 * 1. Primary: Tanggal Order (request_date) DESC (YYYY-MM-DD terbaru di atas).
 * 2. Secondary: Waktu Dibuat / Diinput ke Sistem (created_at) DESC.
 * 3. Tertiary: Nomor RO Numerik DESC (e.g. 97621 > 97530 > 40001 > 40000 > 30000).
 * 4. Tie-Breaker: Kombinasi ro_number dan id DESC untuk stabilitas 100%.
 */
export function sortOrdersNewestFirst(orders: RequestOrder[]): RequestOrder[] {
  if (!orders || orders.length === 0) return [];

  return [...orders].sort((a, b) => {
    // 1. Tanggal Order / Request Date DESC (YYYY-MM-DD)
    const dateA = a.request_date ? a.request_date.trim() : '';
    const dateB = b.request_date ? b.request_date.trim() : '';
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      const cmp = dateB.localeCompare(dateA);
      if (cmp !== 0) return cmp;
    }

    // 2. Created At DESC (Waktu input ke sistem / database)
    const createdA = a.created_at ? a.created_at.trim() : '';
    const createdB = b.created_at ? b.created_at.trim() : '';
    if (createdA !== createdB) {
      if (!createdA) return 1;
      if (!createdB) return -1;
      const cmp = createdB.localeCompare(createdA);
      if (cmp !== 0) return cmp;
    }

    // 3. Nomor RO numerik DESC (contoh: 97621 > 97530 > 40001 > 40000 > 30000)
    const numA = parseInt((a.raw_ro_id || a.ro_number || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt((b.raw_ro_id || b.ro_number || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) {
      return numB - numA;
    }

    // 4. Tie-breaker deterministik
    const keyA = `${a.ro_number || ''}__${a.id || ''}`;
    const keyB = `${b.ro_number || ''}__${b.id || ''}`;
    return keyB.localeCompare(keyA);
  });
}
