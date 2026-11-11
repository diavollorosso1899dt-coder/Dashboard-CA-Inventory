import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RoDateRow {
  id: string;
  ro_number: string | null;
  request_date: string | null;
  target_delivery_date: string | null;
  created_at: string | null;
}

const SELECT_COLUMNS = 'id, ro_number, request_date, target_delivery_date, created_at';

function parseCsvParams(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    for (const part of String(value).split(',')) {
      const clean = part.trim();
      if (clean && !result.includes(clean)) result.push(clean);
    }
  }
  return result;
}

/**
 * Endpoint ringan untuk halaman cetak Surat Jalan: hanya mengambil tanggal
 * permintaan RO yang benar-benar direferensikan item, bukan seluruh 800+ RO.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = parseCsvParams(searchParams.getAll('ids'));
    const numbers = parseCsvParams(searchParams.getAll('numbers'));

    if (ids.length === 0 && numbers.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { data: [] },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    const rowsById = new Map<string, RoDateRow>();

    if (ids.length > 0) {
      const { data, error } = await admin
        .from('request_orders')
        .select(SELECT_COLUMNS)
        .in('id', ids);
      if (error) throw new Error(error.message);
      for (const row of (data || []) as RoDateRow[]) {
        rowsById.set(row.id, row);
      }
    }

    if (numbers.length > 0) {
      const { data, error } = await admin
        .from('request_orders')
        .select(SELECT_COLUMNS)
        .in('ro_number', numbers);
      if (error) throw new Error(error.message);
      for (const row of (data || []) as RoDateRow[]) {
        rowsById.set(row.id, row);
      }
    }

    return NextResponse.json(
      { data: Array.from(rowsById.values()) },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
