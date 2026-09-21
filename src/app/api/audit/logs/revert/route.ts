import { NextRequest, NextResponse } from 'next/server';
import { revertAuditLog } from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { logId, actorName, actorRole } = body;

    if (!logId) {
      return NextResponse.json({ success: false, error: 'Parameter logId wajib disertakan.' }, { status: 400 });
    }

    const result = await revertAuditLog(
      logId,
      actorName || 'Super User',
      actorRole || 'Super User'
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Error in /api/audit/logs/revert:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
