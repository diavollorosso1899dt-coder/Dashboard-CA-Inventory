import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bukti foto & tanda tangan serah terima disimpan di Supabase Storage, bukan
 * lagi sebagai base64 di kolom JSONB. Baris DB hanya menyimpan URL publik.
 *
 * Nama objek memakai hash SHA-256 isi file (content-addressed), jadi:
 * - upload ulang file yang sama tidak menambah objek baru;
 * - beberapa baris yang memakai foto yang sama otomatis berbagi satu objek;
 * - retry setelah gagal sebagian bersifat idempoten.
 */
export const PROOF_BUCKET = process.env.PROOF_BUCKET || 'delivery-proofs';
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function proofExtensionForMime(mime: string): string | null {
  return EXTENSION_BY_MIME[(mime || '').toLowerCase().trim()] || null;
}

declare global {
  // eslint-disable-next-line no-var
  var __PROOF_BUCKET_READY__: Promise<void> | undefined;
}

/**
 * Pastikan bucket ada. Dibuat lewat Storage API (service role) sehingga tidak
 * perlu SQL manual. Hasilnya di-cache per proses agar tidak memanggil API
 * setiap upload.
 */
export function ensureProofBucket(admin: SupabaseClient): Promise<void> {
  if (!global.__PROOF_BUCKET_READY__) {
    global.__PROOF_BUCKET_READY__ = (async () => {
      const { data, error } = await admin.storage.getBucket(PROOF_BUCKET);
      if (data) return;

      const { error: createError } = await admin.storage.createBucket(PROOF_BUCKET, {
        public: true,
        fileSizeLimit: PROOF_MAX_BYTES,
      });

      if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(createError.message);
      }
      if (error && !/not found|does not exist/i.test(error.message) && !createError) {
        throw new Error(error.message);
      }
    })().catch((err) => {
      // Jangan simpan promise yang gagal: percobaan berikutnya harus bisa jalan.
      global.__PROOF_BUCKET_READY__ = undefined;
      throw err;
    });
  }

  return global.__PROOF_BUCKET_READY__;
}

/**
 * Upload buffer sebagai objek bukti dan kembalikan URL publiknya.
 */
export async function uploadProofBuffer(
  admin: SupabaseClient,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const mime = (contentType || '').toLowerCase().trim();
  const extension = proofExtensionForMime(mime);
  if (!extension) {
    throw new Error(`Tipe file bukti tidak didukung: ${contentType || '(kosong)'}`);
  }
  if (buffer.length === 0) {
    throw new Error('File bukti kosong.');
  }
  if (buffer.length > PROOF_MAX_BYTES) {
    throw new Error('Ukuran file bukti melebihi 5 MB.');
  }

  await ensureProofBucket(admin);

  const hash = createHash('sha256').update(buffer).digest('hex');
  const objectPath = `proofs/${hash}.${extension}`;

  const { error } = await admin.storage.from(PROOF_BUCKET).upload(objectPath, buffer, {
    contentType: mime,
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) {
    throw new Error(`Gagal mengunggah bukti ke Storage: ${error.message}`);
  }

  const { data } = admin.storage.from(PROOF_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Gagal membuat URL publik bukti.');
  }
  return data.publicUrl;
}

/** True bila string adalah data URL base64 (format lama). */
export function isInlineDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}