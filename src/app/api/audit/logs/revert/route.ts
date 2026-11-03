import { NextRequest, NextResponse } from 'next/server';
import { revertAuditLog } from '@/lib/audit/audit-store';
import { resolveActor } from '@/lib/auth/actor';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { logId, actorName, actorRole } = body;

    if (!logId) {
      return NextResponse.json({ success: false, error: 'Parameter logId wajib disertakan.' }, { status: 400 });
    }

    const actor = resolveActor(req, { name: actorName, role: actorRole });
    const result = await revertAuditLog(logId, actor.name, actor.role);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error in /api/audit/logs/revert:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
