import { NextRequest, NextResponse } from 'next/server';
import { syncRequestOrdersFromSheet, cleanDuplicateRequestOrders } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const result = await syncRequestOrdersFromSheet();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const res = cleanDuplicateRequestOrders();
    return NextResponse.json({
      success: true,
      ...res,
      message: `Berhasil membersihkan ${res.cleanedCount} entri RO duplikat. Total RO unik sekarang: ${res.totalUnique}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
