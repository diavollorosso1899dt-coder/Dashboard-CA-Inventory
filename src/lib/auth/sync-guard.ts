/**
 * Pengaman endpoint sinkronisasi.
 *
 * Impor dari Google Sheets menulis ulang tabel transaksi. Endpoint ini dulu
 * bisa dipanggil siapa saja (termasuk webhook Apps Script lama), sehingga
 * data yang sudah dihapus bisa muncul kembali tanpa persetujuan.
 *
 * Aturan:
 * - Pemanggilan dari UI yang sudah login membawa cookie `ca_auth=true`.
 * - Otomasi/webhook harus mengirim header `x-sync-token` (atau `?token=`)
 *   yang sama dengan env `SYNC_TOKEN`.
 */
export interface SyncRequestLike {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
  nextUrl: { searchParams: { get(name: string): string | null } };
}

export const SYNC_BLOCKED_MESSAGE =
  'Sinkronisasi dikunci. Masuk lewat dashboard untuk sync manual, atau kirim header x-sync-token yang sesuai.';

export function isSyncRequestAllowed(request: SyncRequestLike): boolean {
  const expectedToken = process.env.SYNC_TOKEN;
  if (expectedToken) {
    const provided =
      request.headers.get('x-sync-token') || request.nextUrl.searchParams.get('token');
    if (provided === expectedToken) return true;
  }

  return request.cookies.get('ca_auth')?.value === 'true';
}