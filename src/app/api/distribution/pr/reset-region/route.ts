import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { trashPurchaseRequirementsByRegion } from '@/lib/procurement/reset-region';
import type { RegionType } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

const ALLOWED_REGIONS: RegionType[] = ['JABODETABEK', 'KALBAR'];

/**
 * Reset data PR untuk satu region saja.
 *
 * Body:
 * - region  : "JABODETABEK" | "KALBAR"
 * - confirm : "RESET_PR_<REGION>" (wajib, mencegah pemanggilan tidak sengaja)
 * - actor   : { name?, role? } (opsional; cookie sesi dipakai bila kosong)
 *
 * Berbeda dari /api/distribution/pr/reset yang menghapus permanen semua
 * region, endpoint ini memindahkan asset_requests ke Tempat Sampah dan hanya
 * mereset item PR pada RO region yang dipilih.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const region = body?.region as RegionType;

    if (!ALLOWED_REGIONS.includes(region)) {
      return NextResponse.json(
        { success: false, error: 'Region harus JABODETABEK atau KALBAR.' },
        { status: 400 }
      );
    }

    const expectedConfirm = `RESET_PR_${region}`;
    if (body?.confirm !== expectedConfirm) {
      return NextResponse.json(
        {
          success: false,
          error: `Konfirmasi tidak valid. Kirim confirm: "${expectedConfirm}".`,
        },
        { status: 400 }
      );
    }

    const actor = resolveActor(req, body?.actor);
    const result = await trashPurchaseRequirementsByRegion(region, actor.name, actor.role);

    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (err: any) {
    console.error('[API reset PR region]', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal mereset data PR region.' },
      { status: 500 }
    );
  }
}
