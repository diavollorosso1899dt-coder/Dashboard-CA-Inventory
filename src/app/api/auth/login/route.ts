import { NextResponse } from 'next/server';
import { passwordMatches } from '@/lib/auth/password';
import {
  SUPERUSER_EMAIL,
  SUPERUSER_FULL_NAME,
  isSuperuserIdentifier,
  isSuperuserPassword,
} from '@/lib/auth/superuser';
import {
  getUserProfileByEmail,
  getUserProfiles,
  isServerSupabaseConfigured,
} from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const loginId = (body.email || body.username || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    if (!loginId) {
      return NextResponse.json({ success: false, error: 'Username atau email wajib diisi' }, { status: 400 });
    }

    // 1. Akun Super User bawaan. Setelah password pernah diganti, profil DB
    // menjadi sumber utama dan password default tidak berlaku lagi.
    if (isSuperuserIdentifier(loginId)) {
      let superuserProfile: UserProfile | null = null;

      if (isServerSupabaseConfigured()) {
        try {
          superuserProfile = await getUserProfileByEmail(SUPERUSER_EMAIL);
        } catch (error) {
          console.error('[login] Gagal membaca profil superuser:', error);
          return NextResponse.json(
            { success: false, error: 'Database autentikasi tidak tersedia. Coba lagi beberapa saat.' },
            { status: 503 }
          );
        }
      }

      if (superuserProfile && superuserProfile.is_active === false) {
        return NextResponse.json(
          { success: false, error: 'Akun pengguna ini berstatus non-aktif. Hubungi Super User.' },
          { status: 403 }
        );
      }

      if (!isSuperuserPassword(superuserProfile, password)) {
        return NextResponse.json(
          { success: false, error: 'Kata sandi salah. Gunakan password yang benar untuk akun superuser.' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: superuserProfile?.id || 'usr-superuser',
          email: SUPERUSER_EMAIL,
          full_name: superuserProfile?.full_name || SUPERUSER_FULL_NAME,
          role: 'Super User',
          outlet_assigned: superuserProfile?.outlet_assigned || superuserProfile?.branch_name || null,
          is_active: true,
          created_at: superuserProfile?.created_at || new Date().toISOString(),
        },
        message: 'Login Super User berhasil',
      });
    }

    // 2. Profil pengguna lain
    const profiles = await getUserProfiles();
    const user = profiles.find((p) => 
      (p.username && p.username.toLowerCase() === loginId) ||
      p.email.toLowerCase() === loginId || 
      (p.full_name && p.full_name.toLowerCase().replace(/\s+/g, '') === loginId)
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun dengan username tersebut tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Akun pengguna ini berstatus non-aktif. Hubungi Super User.' },
        { status: 403 }
      );
    }

    if (!passwordMatches(user, password)) {
      const hasStoredPassword = Boolean((user.password || user.phone || '').trim());
      return NextResponse.json(
        {
          success: false,
          error: hasStoredPassword
            ? 'Kata sandi salah. Masukkan kata sandi yang sesuai.'
            : 'Password akun ini belum diatur. Hubungi Super User untuk mengatur ulang.',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        outlet_assigned: user.outlet_assigned || user.branch_name || null,
        is_active: user.is_active ?? true,
        created_at: user.created_at,
      },
      message: 'Login berhasil',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}
