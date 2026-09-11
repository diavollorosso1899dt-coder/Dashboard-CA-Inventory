import { NextResponse } from 'next/server';
import { getAdminClient, isServerSupabaseConfigured } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isConfigured = isServerSupabaseConfigured();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('your-anon-key'));
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-service-role'));

  if (!isConfigured) {
    return NextResponse.json({
      status: 'NOT_CONFIGURED',
      message: 'Kredensial Supabase belum diisi di .env.local atau masih menggunakan nilai placeholder.',
      config: {
        urlProvided: Boolean(supabaseUrl && !supabaseUrl.includes('your-project')),
        hasAnonKey,
        hasServiceKey,
      },
      instructions: {
        step1: 'Buka dashboard Supabase (https://supabase.com/dashboard).',
        step2: 'Pilih proyek Anda -> Project Settings -> API.',
        step3: 'Salin Project URL, anon public key, dan service_role secret key ke file .env.local.',
        step4: 'Buka SQL Editor di Supabase dan jalankan script dari file supabase/schema.sql.',
      },
    });
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({
      status: 'ERROR',
      message: 'Gagal membuat Supabase client.',
    }, { status: 500 });
  }

  // Test table reachability
  const tables = [
    'asset_requests',
    'outlets',
    'user_profiles',
    'asset_transfers',
    'request_orders',
    'surat_jalan',
    'disposition_requests',
  ];

  const tableResults: Record<string, { status: 'OK' | 'MISSING_OR_ERROR'; message?: string; count?: number }> = {};
  let reachableTablesCount = 0;

  await Promise.all(
    tables.map(async (table) => {
      try {
        const { data, count, error } = await admin.from(table).select('id', { count: 'exact' }).limit(1);
        if (error) {
          tableResults[table] = { status: 'MISSING_OR_ERROR', message: error.message };
        } else {
          tableResults[table] = { status: 'OK', count: count ?? data?.length ?? 0 };
          reachableTablesCount++;
        }
      } catch (err: any) {
        tableResults[table] = { status: 'MISSING_OR_ERROR', message: err.message };
      }
    })
  );

  const isConnected = reachableTablesCount > 0;

  return NextResponse.json({
    status: isConnected ? (reachableTablesCount === tables.length ? 'HEALTHY' : 'PARTIAL') : 'UNREACHABLE',
    supabaseUrl: supabaseUrl.replace(/^(https:\/\/[^.]+).*/, '$1...'),
    tablesChecked: tables.length,
    tablesReady: reachableTablesCount,
    tableDetails: tableResults,
    message: isConnected
      ? `Supabase terhubung. ${reachableTablesCount}/${tables.length} tabel siap menerima data input.`
      : 'Supabase URL dikonfigurasi tetapi tabel belum dapat diakses. Jalankan supabase/schema.sql di SQL Editor.',
  });
}
