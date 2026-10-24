import { NextResponse } from 'next/server';
import { validateInitialPassword } from '@/lib/auth/password';
import { SUPERUSER_EMAIL } from '@/lib/auth/superuser';
import { getUserProfiles, saveUserProfile, deleteUserProfile } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

function sanitizeUser(user: UserProfile): UserProfile {
  const { password, phone, ...safe } = user;
  return safe as UserProfile;
}

export async function GET() {
  try {
    const users = await getUserProfiles();
    const visibleUsers = users
      .filter((user) => user.email?.toLowerCase() !== SUPERUSER_EMAIL)
      .map(sanitizeUser);
    return NextResponse.json({ success: true, data: visibleUsers });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memuat data pengguna' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = (body.username || body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    const { full_name, role, outlet_assigned } = body;

    if (!username || !full_name || !role) {
      return NextResponse.json({ success: false, error: 'Username, Nama Lengkap, dan Role wajib diisi.' }, { status: 400 });
    }

    if (username === SUPERUSER_EMAIL) {
      return NextResponse.json(
        { success: false, error: 'Akun Super User bawaan tidak dapat diubah dari menu Kelola Pengguna.' },
        { status: 403 }
      );
    }

    const profiles = await getUserProfiles();
    const existing = profiles.find(
      (user) =>
        (body.id && user.id === body.id) ||
        user.email?.toLowerCase() === username ||
        user.username?.toLowerCase() === username
    ) || null;

    if (existing?.email?.toLowerCase() === SUPERUSER_EMAIL) {
      return NextResponse.json(
        { success: false, error: 'Akun Super User bawaan tidak dapat diubah dari menu Kelola Pengguna.' },
        { status: 403 }
      );
    }

    // Password awal wajib diisi untuk akun baru. Saat edit, kolom kosong
    // berarti password lama dipertahankan.
    if (!existing || password) {
      const validation = validateInitialPassword(password);
      if (!validation.ok) {
        return NextResponse.json(
          { success: false, error: validation.message, code: validation.code },
          { status: 400 }
        );
      }
    }

    const saved = await saveUserProfile({
      id: existing?.id || body.id || undefined,
      username,
      email: username,
      password: password || undefined,
      full_name,
      role,
      outlet_assigned: outlet_assigned || null,
      allowed_features: Array.isArray(body.allowed_features) ? body.allowed_features : undefined,
      created_at: existing?.created_at,
    });

    return NextResponse.json({ success: true, data: sanitizeUser(saved) });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menyimpan profil user' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    let username = searchParams.get('username') || searchParams.get('email');

    if (!id && !username) {
      try {
        const body = await req.json();
        id = body.id;
        username = body.username || body.email;
      } catch (e) {}
    }

    const target = id || username;
    if (!target) {
      return NextResponse.json({ success: false, error: 'ID atau Username pengguna wajib disertakan.' }, { status: 400 });
    }

    if (target.trim().toLowerCase() === SUPERUSER_EMAIL) {
      return NextResponse.json(
        { success: false, error: 'Akun Super User bawaan tidak dapat dihapus.' },
        { status: 403 }
      );
    }

    const profiles = await getUserProfiles();
    const targetProfile = profiles.find(
      (user) =>
        user.id === target ||
        user.email?.toLowerCase() === target.toLowerCase() ||
        user.username?.toLowerCase() === target.toLowerCase()
    );

    if (targetProfile?.email?.toLowerCase() === SUPERUSER_EMAIL) {
      return NextResponse.json(
        { success: false, error: 'Akun Super User bawaan tidak dapat dihapus.' },
        { status: 403 }
      );
    }

    await deleteUserProfile(target);
    return NextResponse.json({ success: true, message: 'Pengguna berhasil dihapus' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menghapus profil user' }, { status: 500 });
  }
}
