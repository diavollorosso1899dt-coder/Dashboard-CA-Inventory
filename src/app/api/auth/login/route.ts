import { NextResponse } from 'next/server';
import { getUserProfiles } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email wajib diisi' }, { status: 400 });
    }

    const profiles = await getUserProfiles();
    const cleanEmail = email.trim().toLowerCase();

    // Find user by email
    const user = profiles.find((p) => p.email.toLowerCase() === cleanEmail);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun dengan email tersebut tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Akun pengguna ini berstatus non-aktif. Hubungi Super User.' },
        { status: 403 }
      );
    }

    // In this internal portal, password validation allows standard default 'password123' or any non-empty password
    if (password && password.length < 4) {
      return NextResponse.json(
        { success: false, error: 'Password minimal 4 karakter.' },
        { status: 400 }
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
        phone: user.phone || null,
        is_active: user.is_active ?? true,
      },
      message: 'Login berhasil',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}
