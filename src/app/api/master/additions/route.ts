import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminClient,
  getCachedMasterAssetCatalog,
} from '@/lib/supabase/server';
import { normalizeSoRegion } from '@/lib/so-harian/region';
import { auditMutation } from '@/lib/audit/record-change';
import {
  buildMasterAdditionDrafts,
  planSessionAppend,
  selectNewAdditionDrafts,
  type MasterAdditionDraft,
  type SessionDetailLike,
} from '@/lib/master/additions';

export const dynamic = 'force-dynamic';

const ADDITIONS_TABLE = 'master_asset_additions';
const ADDITION_COLUMNS =
  'region,item_name,normalized_name,sku,unit,classification,specification,photo_url,source,source_ro_number,is_active';
const DETAIL_PAGE_SIZE = 1000;

function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return (
    code === '42P01' ||
    /relation .* does not exist|could not find the table/i.test(message)
  );
}

function migrationResponse(skipped = 0) {
  return NextResponse.json({
    success: true,
    addedToMaster: 0,
    addedToSession: 0,
    skipped,
    migrationRequired: true,
    message:
      'Tabel master_asset_additions belum ada. Jalankan supabase/master-asset-additions.sql.',
  });
}

async function readSessionDetails(
  admin: any,
  sessionId: string
): Promise<SessionDetailLike[]> {
  const details: SessionDetailLike[] = [];

  for (let from = 0; ; from += DETAIL_PAGE_SIZE) {
    const { data, error } = await admin
      .from('so_details')
      .select('id,kode_barang,nama_barang')
      .eq('session_id', sessionId)
      .order('kode_barang')
      .range(from, from + DETAIL_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    details.push(...data);
    if (data.length < DETAIL_PAGE_SIZE) break;
  }

  return details;
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Koneksi Supabase tidak tersedia.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const region = normalizeSoRegion(body?.region);
    if (!region) {
      return NextResponse.json(
        { success: false, error: 'Region harus JABODETABEK atau KALBAR.' },
        { status: 400 }
      );
    }

    const roNumber = String(body?.ro_number || '').trim();
    const items = Array.isArray(body?.items) ? body.items : [];
    const drafts = buildMasterAdditionDrafts({
      region,
      roNumber,
      items,
      catalog: getCachedMasterAssetCatalog(),
    });

    if (drafts.length === 0) {
      return NextResponse.json({
        success: true,
        addedToMaster: 0,
        addedToSession: 0,
        skipped: 0,
        migrationRequired: false,
      });
    }

    const { data: existingRows, error: readError } = await admin
      .from(ADDITIONS_TABLE)
      .select('region,normalized_name,sku')
      .eq('region', region);

    if (readError) {
      if (isMissingTableError(readError)) return migrationResponse(drafts.length);
      throw new Error(readError.message);
    }

    const newDrafts = selectNewAdditionDrafts(drafts, existingRows || []);

    if (newDrafts.length > 0) {
      const { error: insertError } = await admin
        .from(ADDITIONS_TABLE)
        .upsert(newDrafts, {
          onConflict: 'region,normalized_name',
          ignoreDuplicates: true,
        });

      if (insertError) {
        if (isMissingTableError(insertError)) {
          return migrationResponse(drafts.length);
        }
        throw new Error(insertError.message);
      }
    }

    let addedToSession = 0;
    let sessionId: string | null = null;
    let sessionWarning: string | null = null;

    const { data: sessionRows, error: sessionError } = await admin
      .from('so_sessions')
      .select('id,tanggal,status,region')
      .eq('region', region)
      .eq('status', 'IN_PROGRESS')
      .order('tanggal', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionError) {
      sessionWarning = `Sesi SO tidak dapat dibaca: ${sessionError.message}`;
    } else if (sessionRows && sessionRows.length > 0) {
      const session = sessionRows[0];
      sessionId = String(session.id);

      try {
        const existingDetails = await readSessionDetails(admin, sessionId);
        const appendRows = planSessionAppend({
          sessionId,
          roNumber,
          additions: drafts,
          existingDetails,
        });

        if (appendRows.length > 0) {
          const { error: appendError } = await admin
            .from('so_details')
            .upsert(appendRows);
          if (appendError) throw new Error(appendError.message);
          addedToSession = appendRows.length;

          const { count, error: countError } = await admin
            .from('so_details')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId);
          if (countError) throw new Error(countError.message);

          const { error: updateError } = await admin
            .from('so_sessions')
            .update({
              total_items: count || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
          if (updateError) throw new Error(updateError.message);
        }
      } catch (sessionErr: any) {
        sessionWarning =
          sessionErr?.message || 'Gagal menambahkan item ke sesi SO.';
      }
    }

    try {
      await auditMutation(req, {
        entityType: 'ITEM',
        entityTitle: `Master tambahan dari ${roNumber || 'RO'}`,
        entityId: roNumber || undefined,
        actionType: 'CREATE',
        details:
          `Menambahkan ${newDrafts.length} item ke master ${region}` +
          (addedToSession > 0
            ? ` dan ${addedToSession} item ke sesi SO ${sessionId}`
            : ''),
        next: {
          region,
          roNumber,
          items: newDrafts.map((draft) => draft.item_name),
        },
      });
    } catch (auditErr) {
      console.warn('[master/additions] Gagal mencatat audit:', auditErr);
    }

    return NextResponse.json({
      success: true,
      addedToMaster: newDrafts.length,
      addedToSession,
      skipped: drafts.length - newDrafts.length,
      sessionId,
      migrationRequired: false,
      warning: sessionWarning || undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Gagal menambahkan item ke master.',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const region = normalizeSoRegion(req.nextUrl.searchParams.get('region'));
    if (!region) {
      return NextResponse.json(
        { success: false, error: 'Region harus JABODETABEK atau KALBAR.' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({
        success: true,
        items: [],
        migrationRequired: false,
      });
    }

    const { data, error } = await admin
      .from(ADDITIONS_TABLE)
      .select(ADDITION_COLUMNS)
      .eq('region', region)
      .eq('is_active', true)
      .order('item_name', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          items: [],
          migrationRequired: true,
        });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      items: data || [],
      migrationRequired: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal memuat master tambahan.' },
      { status: 500 }
    );
  }
}
