import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import {
  PROOF_MAX_BYTES,
  proofExtensionForMime,
  uploadProofBuffer,
} from '@/lib/supabase/proof-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/distribution/proof-upload
 *
 * Menerima multipart `file` (foto bukti atau tanda tangan) lalu menyimpannya
 * ke Supabase Storage. Respons: { success, url }.
 *
 * Dipakai oleh DeliveryProofModal agar bukti baru tidak lagi disimpan sebagai
 * base64 di kolom JSONB surat_jalan/asset_transfers.
 */
export async function POST(req: NextRequest) {
  try {
    // Endpoint ini menulis ke Storage publik; batasi ke sesi dashboard yang
    // sudah login (cookie yang sama dengan guard sinkronisasi).
    if (req.cookies.get('ca_auth')?.value !== 'true') {
      return NextResponse.json(
        { error: 'Sesi tidak valid. Silakan login ulang sebelum mengunggah bukti.' },
        { status: 401 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Supabase belum dikonfigurasi di server.' },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const file = form.get('file');

    if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'File bukti wajib dikirim.' }, { status: 400 });
    }

    const blob = file as Blob;
    if (blob.size === 0) {
      return NextResponse.json({ error: 'File bukti kosong.' }, { status: 400 });
    }
    if (blob.size > PROOF_MAX_BYTES) {
      return NextResponse.json(
        { error: 'Ukuran file bukti maksimal 5 MB.' },
        { status: 413 }
      );
    }

    const contentType = (blob.type || '').toLowerCase().trim();
    if (!proofExtensionForMime(contentType)) {
      return NextResponse.json(
        { error: `Tipe file tidak didukung: ${contentType || '(kosong)'}` },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const url = await uploadProofBuffer(admin, buffer, contentType);

    return NextResponse.json({ success: true, url });
  } catch (err: any) {
    console.error('[proof-upload error]:', err?.message);
    return NextResponse.json(
      { error: err?.message || 'Gagal mengunggah bukti.' },
      { status: 500 }
    );
  }
}