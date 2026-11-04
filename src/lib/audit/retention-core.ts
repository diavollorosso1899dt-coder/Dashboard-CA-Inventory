/**
 * Inti pembersihan audit log, tanpa dependensi Supabase.
 *
 * Dipisahkan supaya logika hitung-hapus per batch bisa diuji dengan klien
 * palsu tanpa menyentuh database sungguhan.
 */
export const DELETE_BATCH_SIZE = 500;
export const MAX_BATCHES = 20;

export interface AuditLogRetentionClient {
  /** Hitung log dengan timestamp < cutoff. */
  countOlderThan(cutoff: string): Promise<{ count: number | null; error?: string }>;
  /** Ambil id log tertua (maksimal `limit`). */
  listIdsOlderThan(
    cutoff: string,
    limit: number
  ): Promise<{ ids: string[]; error?: string }>;
  /** Hapus berdasarkan id. */
  deleteByIds(ids: string[]): Promise<{ error?: string }>;
}

export interface PurgeOlderThanOptions {
  /** Hanya hitung, jangan hapus. */
  dryRun?: boolean;
}

export interface PurgeOlderThanResult {
  matched: number;
  deleted: number;
  batches: number;
  error?: string;
}

/**
 * Hitung lalu hapus log yang lebih tua dari cutoff, per batch.
 * Berhenti pada error pertama dan mengembalikan jumlah yang sudah terhapus.
 */
export async function purgeOlderThan(
  client: AuditLogRetentionClient,
  cutoff: string,
  options: PurgeOlderThanOptions = {}
): Promise<PurgeOlderThanResult> {
  const countResult = await client.countOlderThan(cutoff);
  if (countResult.error) {
    return { matched: 0, deleted: 0, batches: 0, error: countResult.error };
  }

  const matched = countResult.count || 0;
  if (options.dryRun || matched === 0) {
    return { matched, deleted: 0, batches: 0 };
  }

  let deleted = 0;
  let batches = 0;
  let error: string | undefined;

  while (batches < MAX_BATCHES) {
    const listResult = await client.listIdsOlderThan(cutoff, DELETE_BATCH_SIZE);
    if (listResult.error) {
      error = listResult.error;
      break;
    }

    const ids = listResult.ids.filter(Boolean);
    if (ids.length === 0) break;

    const deleteResult = await client.deleteByIds(ids);
    if (deleteResult.error) {
      error = deleteResult.error;
      break;
    }

    deleted += ids.length;
    batches += 1;
    if (ids.length < DELETE_BATCH_SIZE) break;
  }

  return { matched, deleted, batches, error };
}