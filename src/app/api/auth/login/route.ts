import { NextResponse } from 'next/server';
import { getUserProfiles } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const loginId = (body.email || body.username || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    if (!loginId) {
      return NextResponse.json({ success: false, error: 'Username atau email wajib diisi' }, { status: 400 });
    }

    // 1. Explicit requested credentials for Superuser
    if (loginId === 'superuser' || loginId === 'superuser@coffee-arabica.co.id') {
      if (password !== 'usergacor') {
        return NextResponse.json(
          { success: false, error: 'Kata sandi salah. Gunakan password yang benar untuk akun superuser.' },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          id: 'usr-superuser',
          email: 'superuser@coffee-arabica.co.id',
          full_name: 'Super User (Administrator)',
          role: 'Super User',
          outlet_assigned: null,
          phone: '081122334455',
          is_active: true,
        },
        message: 'Login Super User berhasil',
      });
    }

    // 2. Check other registered user profiles
    const profiles = await getUserProfiles();
    const user = profiles.find((p) => 
      p.email.toLowerCase() === loginId || 
      (p.full_name && p.full_name.toLowerCase().replace(/\s+/g, '') === loginId)
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Akun dengan username/email tersebut tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    if (user.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Akun pengguna ini berstatus non-aktif. Hubungi Super User.' },
        { status: 403 }
      );
    }

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
