import { NextResponse } from 'next/server';
import { getUserProfiles, saveUserProfile, deleteUserProfile, getAdminClient } from '@/lib/supabase/server';
import { auditMutation } from '@/lib/audit/record-change';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const users = await getUserProfiles(true);
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
      outlet_assigned: outlet_assigned || null,
      allowed_region: body.allowed_region || 'ALL',
      allowed_features: Array.isArray(body.allowed_features) ? body.allowed_features : undefined,
    });

    try {
      let previous: any = null;
      const admin = getAdminClient();
      if (admin && body.id) {
        const { data } = await admin.from('user_profiles').select('*').eq('id', body.id).maybeSingle();
        previous = data;
      }
      // Jangan pernah menuliskan password ke audit log.
      const nextSafe = {
        email: username,
        full_name,
        role,
        outlet_assigned: outlet_assigned || null,
        allowed_region: body.allowed_region || 'ALL',
        allowed_features: body.allowed_features,
      };
      const previousSafe = previous
        ? {
            email: previous.email,
            full_name: previous.full_name,
            role: previous.role,
            outlet_assigned: previous.outlet_assigned,
            allowed_region: previous.allowed_region,
            allowed_features: previous.allowed_features,
          }
        : undefined;
      await auditMutation(req, {
        entityType: 'PENGGUNA',
        entityTitle: `Pengguna ${full_name} (${username})`,
        entityId: saved?.id || body.id,
        previous: previousSafe,
        next: nextSafe,
        details: previous
          ? `Memperbarui akun pengguna ${full_name} (${username}).`
          : `Membuat akun pengguna baru ${full_name} (${username}) dengan role ${role}.`,
      });
    } catch (auditErr) {
      console.error('Failed recording user audit log:', auditErr);
    }

    return NextResponse.json({ success: true, data: saved });
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

    let previous: any = null;
    try {
      const admin = getAdminClient();
      if (admin) {
        const query = admin.from('user_profiles').select('*');
        const { data } = id
          ? await query.eq('id', id).maybeSingle()
          : await query.eq('email', String(username || '').toLowerCase()).maybeSingle();
        previous = data;
      }
    } catch (auditErr) {
      console.warn('Gagal mengambil data user sebelum dihapus:', auditErr);
    }

    await deleteUserProfile(target);

    try {
      await auditMutation(req, {
        entityType: 'PENGGUNA',
        entityTitle: `Pengguna ${previous?.full_name || target}`,
        entityId: previous?.id || id || undefined,
        actionType: 'PERMANENT_DELETE',
        details: `Menghapus akun pengguna ${previous?.full_name || target}${previous?.email ? ` (${previous.email})` : ''}.`,
        previousState: previous
          ? {
              email: previous.email,
              full_name: previous.full_name,
              role: previous.role,
              outlet_assigned: previous.outlet_assigned,
              allowed_region: previous.allowed_region,
              allowed_features: previous.allowed_features,
            }
          : undefined,
      });
    } catch (auditErr) {
      console.error('Failed recording user delete audit log:', auditErr);
    }

    return NextResponse.json({ success: true, message: 'Pengguna berhasil dihapus' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal menghapus profil user' }, { status: 500 });
  }
}

