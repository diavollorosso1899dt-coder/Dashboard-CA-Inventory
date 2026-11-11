export type NormalizedSjStatus =
  | 'PROCESSED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

/**
 * Menyeragamkan status Surat Jalan dari berbagai sumber data lama.
 * Dipakai oleh daftar SJ dan halaman cetak supaya aturan status tidak
 * berbeda antar-layar.
 */
export function normalizeSjStatus(status?: string | null): NormalizedSjStatus {
  const s = (status || '').toUpperCase().trim();
  if (s === 'SELESAI' || s === 'DELIVERED' || s === 'DITERIMA DI OUTLET') {
    return 'DELIVERED';
  }
  if (s === 'DALAM PENGIRIMAN' || s === 'SHIPPED' || s === 'IN_TRANSIT') {
    return 'SHIPPED';
  }
  if (s === 'DIBATALKAN' || s === 'CANCELLED') {
    return 'CANCELLED';
  }
  return 'PROCESSED';
}
