import { NextRequest, NextResponse } from 'next/server';
import { purgeOldAuditLogs } from '@/lib/audit/retention';
import { resolveActor } from '@/lib/auth/actor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET/POST /api/audit/cleanup
 *
 * Menghapus audit log yang lebih tua dari 7 hari.
 * - Vercel Cron mengirim `Authorization: Bearer <CRON_SECRET>`.
 * - Manual dari dashboard mengirim cookie `ca_auth=true`.
 * - `?dryRun=1` hanya menghitung, tidak menghapus.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization') || '';
    if (header === `Bearer ${secret}`) return true;
  }
  return req.cookies.get('ca_auth')?.value === 'true';
}

async function handle(req: NextRequest, body?: any) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: 'Tidak berwenang. Kirim Authorization Bearer CRON_SECRET atau login dahulu.' },
      { status: 401 }
    );
  }

  const params = req.nextUrl.searchParams;
  const dryRun = params.get('dryRun') === '1' || params.get('dryRun') === 'true' || body?.dryRun === true;
  const daysParam = params.get('days') || body?.days;
  const retentionDays = daysParam ? Number(daysParam) : undefined;

  const actor = resolveActor(req);
  const result = await purgeOldAuditLogs({
    retentionDays,
    dryRun,
    trigger: dryRun ? 'manual' : req.headers.get('authorization')?.startsWith('Bearer ') ? 'cron' : 'manual',
    actorName: actor.name,
    actorRole: actor.role,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  return handle(req, body);
}