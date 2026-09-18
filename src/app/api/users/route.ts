import { NextResponse } from 'next/server';
import { getUserProfiles, saveUserProfile } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const users = await getUserProfiles();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memuat data pengguna' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = (body.username || body.email || '').trim().toLowerCase();
    const { full_name, role, outlet_assigned, password } = body;

    if (!username || !full_name || !role) {
      return NextResponse.json({ success: false, error: 'Username, Nama Lengkap, dan Role wajib diisi.' }, { status: 400 });
    }

    const saved = await saveUserProfile({
      id: body.id || undefined,
      username,
      email: username,
      password: password || undefined,
      phone: password || undefined,
      full_name,
      role,
      outlet_assigned: outlet_assigned || null
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menyimpan profil user' }, { status: 500 });
  }
}
