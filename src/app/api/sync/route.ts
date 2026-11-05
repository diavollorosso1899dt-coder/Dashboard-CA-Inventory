import { NextRequest, NextResponse } from 'next/server';
import { isSyncRequestAllowed, SYNC_BLOCKED_MESSAGE } from '@/lib/auth/sync-guard';
import { resolveActor } from '@/lib/auth/actor';
import { runSync, SYNC_SOURCES, SupabaseSyncStore } from '@/lib/sync-engine';
import { parseSyncRequest } from '@/lib/sync-engine/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(req: NextRequest) {
  try {
    if (!isSyncRequestAllowed(req)) {
      return NextResponse.json({ success: false, message: SYNC_BLOCKED_MESSAGE }, { status: 401 });
    }

    let body: any = null;
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const parsed = parseSyncRequest({
      query: {
        sources: req.nextUrl.searchParams.get('sources'),
        dryRun: req.nextUrl.searchParams.get('dryRun'),
        force: req.nextUrl.searchParams.get('force'),
        trigger: req.nextUrl.searchParams.get('trigger'),
      },
      body,
      authorization: req.headers.get('authorization'),
    });

    const actor = resolveActor(req);
    const result = await runSync(
      { ...parsed.options, actorName: parsed.options.actorName || actor.name },
      {
        store: new SupabaseSyncStore(),
        sources: SYNC_SOURCES,
        now: () => new Date(),
      }
    );

    const status = result.reason === 'locked' ? 409 : result.success ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}