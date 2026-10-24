import { NextResponse } from 'next/server';
import {
  getStoredPassword,
  passwordMatches,
  validatePasswordChange,
} from '@/lib/auth/password';
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
  saveUserProfile,
} from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identifier = (body.identifier || body.email || body.username || '').trim().toLowerCase();
    const currentPassword = (body.currentPassword || '').trim();
    const newPassword = (body.newPassword || '').trim();
    const confirmPassword = (body.confirmPassword || '').trim();

    if (!identifier) {
      return NextResponse.json(
        { success: false, error: 'Akun pengguna wajib diidentifikasi.' },
        { status: 400 }
      );
    }

    const validation = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.message, code: validation.code },
        { status: 400 }
      );
    }

    if (!isServerSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Database belum dikonfigurasi untuk menyimpan password.' },
        { status: 503 }
      );
    }

    let profile: UserProfile | null = null;

    if (isSuperuserIdentifier(identifier)) {
      try {
        profile = await getUserProfileByEmail(SUPERUSER_EMAIL);
      } catch (error) {
        console.error('[change-password] Gagal membaca profil superuser:', error);
        return NextResponse.json(
          { success: false, error: 'Gagal memverifikasi password superuser.' },
          { status: 503 }
        );
      }

      if (!isSuperuserPassword(profile, currentPassword)) {
        return NextResponse.json(
          { success: false, error: 'Password saat ini salah.' },
          { status: 401 }
        );
      }
    } else {
      const profiles = await getUserProfiles();
      profile = profiles.find(
        (p) =>
          p.email?.toLowerCase() === identifier ||
          p.username?.toLowerCase() === identifier
      ) || null;

      if (!profile) {
        return NextResponse.json(
          { success: false, error: 'Akun pengguna tidak ditemukan.' },
          { status: 404 }
        );
      }

      if (profile.is_active === false) {
        return NextResponse.json(
          { success: false, error: 'Akun pengguna ini berstatus non-aktif.' },
          { status: 403 }
        );
      }

      if (!passwordMatches(profile, currentPassword)) {
        return NextResponse.json(
          { success: false, error: 'Password saat ini salah.' },
          { status: 401 }
        );
      }
    }

    const saved = await saveUserProfile(
      profile
        ? {
            id: profile.id,
            username: profile.username || profile.email,
            email: profile.email,
            password: newPassword,
            full_name: profile.full_name,
            role: profile.role,
            branch_name: profile.branch_name,
            outlet_assigned: profile.outlet_assigned,
            phone: profile.phone,
            is_active: profile.is_active,
            allowed_features: profile.allowed_features,
            created_at: profile.created_at,
          }
        : {
            username: SUPERUSER_EMAIL,
            email: SUPERUSER_EMAIL,
            password: newPassword,
            full_name: SUPERUSER_FULL_NAME,
            role: 'Super User',
            is_active: true,
          }
    );

    // Pastikan nilai yang tersimpan benar-benar password baru. Ini juga
    // memastikan perubahan tidak hanya tersimpan di cache lokal.
    const persisted = await getUserProfileByEmail(saved.email);
    if (!persisted || getStoredPassword(persisted) !== newPassword) {
      return NextResponse.json(
        { success: false, error: 'Password gagal disimpan. Silakan coba lagi.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password berhasil diubah.',
      data: { email: saved.email },
    });
  } catch (error) {
    console.error('[change-password]', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
