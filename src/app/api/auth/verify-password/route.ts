import { NextResponse } from 'next/server';
import { isSuperuserPassword, SUPERUSER_EMAIL } from '@/lib/auth/superuser';
import { getUserProfileByEmail, isServerSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint otorisasi khusus Super User. Dipakai modul yang membutuhkan
 * persetujuan superuser, misalnya penghapusan item dokumen distribusi.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = (body.password || '').trim();

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Kata sandi Superuser wajib diisi.' },
        { status: 400 }
      );
    }

    if (!isServerSupabaseConfigured()) {
      if (isSuperuserPassword(null, password)) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.json(
        { success: false, error: 'Kata sandi Superuser salah. Akses ditolak!' },
        { status: 401 }
      );
    }

    let profile = null;
    try {
      profile = await getUserProfileByEmail(SUPERUSER_EMAIL);
    } catch (error) {
      console.error('[verify-password] Gagal membaca profil superuser:', error);
      return NextResponse.json(
        { success: false, error: 'Gagal memverifikasi kata sandi Superuser.' },
        { status: 503 }
      );
    }

    if (!isSuperuserPassword(profile, password)) {
      return NextResponse.json(
        { success: false, error: 'Kata sandi Superuser salah. Akses ditolak!' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[verify-password]', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
