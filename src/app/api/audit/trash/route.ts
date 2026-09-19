import { NextRequest, NextResponse } from 'next/server';
import { 
  getTrashItems, 
  restoreItemFromTrash, 
  permanentDeleteItem, 
  emptyAllTrash 
} from '@/lib/audit/audit-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await getTrashItems();
    return NextResponse.json({ success: true, data: items, total: items.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, actorName, actorRole } = body;

    if (action === 'restore') {
      if (!id) {
        return NextResponse.json({ success: false, error: 'ID item wajib disertakan' }, { status: 400 });
      }
      const res = await restoreItemFromTrash(id, actorName, actorRole);
      return NextResponse.json(res);
    }

    return NextResponse.json({ success: false, error: 'Action tidak dikenal' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const emptyAll = searchParams.get('emptyAll') === 'true';
    const actorName = searchParams.get('actorName') || 'Super User';
    const actorRole = searchParams.get('actorRole') || 'Super User';

    if (emptyAll) {
      const res = await emptyAllTrash(actorName, actorRole);
      return NextResponse.json({ success: true, ...res });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID item wajib disertakan' }, { status: 400 });
    }

    const res = await permanentDeleteItem(id, actorName, actorRole);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
