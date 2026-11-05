/**
 * Penerjemah error Supabase untuk store sync engine.
 *
 * Penting: error asli tidak boleh dibungkus ulang kalau pesannya tidak
 * diterjemahkan, karena pemanggil (mis. lock) memeriksa properti `code`
 * seperti `23505` (unique violation saat rebutan lock).
 */

export const SYNC_SCHEMA_HINT =
  'Tabel sync engine belum tersedia. Jalankan supabase/sync-engine.sql di Supabase SQL Editor terlebih dahulu.';

export function schemaHint(message: string): string {
  if (/Could not find the table|relation .* does not exist|42P01/i.test(message)) {
    return SYNC_SCHEMA_HINT;
  }
  return message;
}

export function storeError<T extends { message: string; code?: string }>(error: T): T | Error {
  const translated = schemaHint(error.message);
  if (translated === error.message) return error;
  return new Error(translated);
}