import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAuditEntity,
  deleteAuditLogEntry,
  getAuditLogById,
  restoreDeletedEntity,
  revertAuditLog,
} from '@/lib/audit/audit-store';
import { resolveAuditLogAction } from '@/lib/audit/log-action';
import { resolveActor } from '@/lib/auth/actor';

export const dynamic = 'force-dynamic';

/**
 * Menjalankan satu opsi tindakan pada Audit Log:
 * - action = "revert" : kembalikan data ke kondisi sebelumnya / pulihkan dari sampah
 * - action = "delete" : hapus data terkait (CREATE/RESTORE) atau hapus log saja
 *
 * Jenis tindakan ditentukan ulang di server dari isi log, bukan dari klien,
 * supaya tombol tidak bisa dipakai untuk operasi yang tidak sesuai.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const logId = body?.logId;
    const action = body?.action;

    if (!logId) {
      return NextResponse.json(
        { success: false, error: 'Parameter logId wajib disertakan.' },
        { status: 400 }
      );
    }

    const log = await getAuditLogById(logId);
    if (!log) {
      return NextResponse.json(
        { success: false, error: 'Catatan log tidak ditemukan.' },
        { status: 404 }
      );
    }

    const actor = resolveActor(req, { name: body.actorName, role: body.actorRole });
    const kind = resolveAuditLogAction(log);

    if (action === 'revert') {
      if (kind !== 'revert') {
        return NextResponse.json(
          { success: false, error: 'Log ini tidak bisa dikembalikan. Gunakan opsi Hapus.' },
          { status: 400 }
        );
      }

      if (log.action_type === 'DELETE_TO_TRASH') {
        const result = await restoreDeletedEntity(log, actor.name, actor.role);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      const result = await revertAuditLog(log.id, actor.name, actor.role);
      return NextResponse.json(
        { success: result.success, message: result.message, data: result.data },
        { status: result.success ? 200 : 400 }
      );
    }

    if (action === 'delete') {
      if (kind === 'revert') {
        return NextResponse.json(
          { success: false, error: 'Log ini masih bisa dikembalikan. Gunakan opsi Kembalikan.' },
          { status: 400 }
        );
      }

      const result =
        kind === 'delete-entity'
          ? await deleteAuditEntity(log, actor.name, actor.role)
          : await deleteAuditLogEntry(log.id);

      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    return NextResponse.json(
      { success: false, error: 'Aksi tidak dikenal. Gunakan "revert" atau "delete".' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Error in /api/audit/logs/actions:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal menjalankan aksi audit log.' },
      { status: 500 }
    );
  }
}