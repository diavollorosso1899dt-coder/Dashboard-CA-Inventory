import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs, recordAuditLog, revertAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search') || undefined;
    const actionType = searchParams.get('actionType') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');

    const result = await getAuditLogs({ search, actionType, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Revert action
    if (body.action === 'revert') {
      const { logId, actorName, actorRole } = body;
      const res = await revertAuditLog(logId, actorName, actorRole);
      return NextResponse.json(res, { status: res.success ? 200 : 400 });
    }

    const { actorName, actorRole, actionType, entityType, entityTitle, details, options } = body;

    const entry = await recordAuditLog(
      actorName,
      actorRole,
      actionType,
      entityType,
      entityTitle,
      details,
      options
    );

    return NextResponse.json({ success: true, data: entry });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
