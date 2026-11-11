import type { SuratJalan } from '../supabase/types';
import { normalizeSjStatus } from './sj-status.ts';

/**
 * Membaca parameter `ids` dari URL cetak. Nilai boleh berupa satu string
 * berkoma, beberapa nilai `ids` berulang, atau gabungan keduanya.
 */
export function parsePrintIds(
  value: string | string[] | null | undefined
): string[] {
  if (value == null) return [];

  const chunks = Array.isArray(value) ? value : [value];
  const ids: string[] = [];

  for (const chunk of chunks) {
    for (const part of String(chunk).split(',')) {
      const id = part.trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return ids;
}

function getDocOutlet(doc: SuratJalan): string {
  return (doc.tujuan_outlet_nama || doc.branch_name || '').trim().toLowerCase();
}

function canMergeWithPrimary(primary: SuratJalan, doc: SuratJalan): boolean {
  const primaryStatus = normalizeSjStatus(primary.status);
  const docStatus = normalizeSjStatus(doc.status);

  if (primaryStatus === 'DELIVERED') return docStatus === 'DELIVERED';
  if (primaryStatus === 'CANCELLED') return docStatus === 'CANCELLED';
  return docStatus !== 'DELIVERED' && docStatus !== 'CANCELLED';
}

export interface SelectPrintDocumentsInput {
  primary: SuratJalan;
  siblings?: SuratJalan[] | null;
  explicitIds?: string[] | null;
}

/**
 * Membuat URL cetak dengan daftar dokumen yang eksplisit. Tanpa `ids`,
 * halaman cetak hanya akan mencetak dokumen utama.
 */
export function buildPrintUrl(
  primaryId: string,
  outletName: string,
  docs: Array<{ id?: string | null }>
): string {
  const ids = docs
    .map((doc) => doc.id)
    .filter((id): id is string => Boolean(id));

  const params = new URLSearchParams({ outlet: outletName });
  if (ids.length > 0) params.set('ids', ids.join(','));

  return `/distribution/surat-jalan/print/${encodeURIComponent(primaryId)}?${params.toString()}`;
}

/**
 * Menentukan dokumen yang boleh digabung ke satu lembar cetak.
 *
 * Aturan utama:
 * - Tanpa `ids` eksplisit, hanya dokumen utama yang dicetak. Ini mencegah
 *   dokumen lama dengan outlet yang sama ikut tercetak ulang.
 * - Dengan `ids` eksplisit, gabungkan hanya dokumen outlet yang sama dan
 *   berstatus sealur dengan dokumen utama.
 * - Dokumen aktif tidak pernah menyeret dokumen DELIVERED/CANCELLED, dan
 *   sebaliknya.
 */
export function selectPrintDocuments({
  primary,
  siblings,
  explicitIds,
}: SelectPrintDocumentsInput): SuratJalan[] {
  const ids = explicitIds ?? [];
  if (ids.length === 0) return [primary];

  const wanted = new Set(ids);
  wanted.add(primary.id);

  const primaryOutlet = getDocOutlet(primary);
  const selected: SuratJalan[] = [primary];
  const seen = new Set([primary.id]);

  for (const doc of siblings ?? []) {
    if (!doc?.id || seen.has(doc.id) || !wanted.has(doc.id)) continue;

    const docOutlet = getDocOutlet(doc);
    if (primaryOutlet && docOutlet && docOutlet !== primaryOutlet) continue;
    if (!canMergeWithPrimary(primary, doc)) continue;

    seen.add(doc.id);
    selected.push(doc);
  }

  return selected;
}
