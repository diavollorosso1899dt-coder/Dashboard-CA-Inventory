-- ==============================================================================
-- AUDIT TRAIL & TEMPAT SAMPAH
-- Jalankan file ini sekali di Supabase SQL Editor.
-- Tanpa tabel ini, log perubahan hanya tersimpan di memori server dan hilang
-- setiap instance/server restart.
-- ==============================================================================

-- 1. Tabel audit_logs: catatan setiap perubahan data oleh user
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_name TEXT NOT NULL DEFAULT 'System',
    actor_role TEXT NOT NULL DEFAULT 'User',
    action_type TEXT NOT NULL, -- CREATE | UPDATE | STATUS_CHANGE | DELETE_TO_TRASH | RESTORE | PERMANENT_DELETE | EMPTY_TRASH | REVERT
    entity_type TEXT NOT NULL, -- ASET | RO | OUTLET | ITEM | SURAT_JALAN | DISPOSISI | TRANSFER | PENGGUNA | SYSTEM
    entity_id TEXT,
    entity_title TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    previous_state JSONB,
    new_state JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs(entity_id);

-- 2. Tabel trash_items: data yang dihapus user tetapi masih bisa dipulihkan
CREATE TABLE IF NOT EXISTS public.trash_items (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- ASET | OUTLET | ITEM | SURAT_JALAN | DISPOSISI | TRANSFER | RO
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    category TEXT,
    region TEXT,
    deleted_by TEXT NOT NULL DEFAULT 'System',
    deleted_by_role TEXT,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    original_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_trash_items_deleted_at ON public.trash_items(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_trash_items_entity_type ON public.trash_items(entity_type);

-- 3. RLS: akses hanya lewat server (service role). Policy permisif agar
--    pembacaan anon tetap bekerja seperti tabel operasional lainnya.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all on audit_logs" ON public.audit_logs;
CREATE POLICY "Allow public all on audit_logs"
ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all on trash_items" ON public.trash_items;
CREATE POLICY "Allow public all on trash_items"
ON public.trash_items FOR ALL USING (true) WITH CHECK (true);