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
    const { email, full_name, role, outlet_assigned } = body;

    if (!email || !full_name || !role) {
      return NextResponse.json({ success: false, error: 'Email, Nama Lengkap, dan Role wajib diisi.' }, { status: 400 });
    }

    const saved = await saveUserProfile({
      id: body.id || undefined,
      email,
      full_name,
      role,
      outlet_assigned: outlet_assigned || null
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menyimpan profil user' }, { status: 500 });
  }
}
