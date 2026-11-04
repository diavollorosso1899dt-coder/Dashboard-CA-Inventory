-- ==============================================================================
-- RETENSI AUDIT LOG 7 HARI (OPSIONAL - ALTERNATIF VERCEL CRON)
--
-- Jalankan file ini di Supabase SQL Editor bila ingin pembersihan berjalan
-- sepenuhnya di database tanpa bergantung pada Vercel Cron.
--
-- Catatan:
-- - Aplikasi sudah menyediakan endpoint /api/audit/cleanup + vercel.json cron.
--   Pakai salah satu saja; keduanya aman dijalankan bersamaan karena sama-sama
--   menghapus berdasarkan cutoff waktu.
-- - pg_cron berjalan di database `postgres` dan butuh extension diaktifkan.
--   Di dashboard Supabase: Database -> Extensions -> aktifkan "pg_cron".
-- - Jadwal 0 20 * * * = 20:00 UTC = 03:00 WIB.
-- ==============================================================================

-- 1. Fungsi pembersihan. Mengembalikan jumlah baris yang dihapus.
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs(retention_days integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    IF retention_days IS NULL OR retention_days < 1 THEN
        RAISE EXCEPTION 'retention_days minimal 1 hari';
    END IF;

    WITH removed AS (
        DELETE FROM public.audit_logs
        WHERE "timestamp" < now() - make_interval(days => retention_days)
        RETURNING 1
    )
    SELECT count(*) INTO deleted_count FROM removed;

    RETURN deleted_count;
END;
$$;

-- Hanya service role / owner yang boleh menjalankan fungsi ini.
REVOKE ALL ON FUNCTION public.purge_old_audit_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_logs(integer) TO service_role;

-- 2. Uji manual (dry-run): hitung dulu tanpa menghapus.
SELECT count(*) AS log_lebih_dari_7_hari
FROM public.audit_logs
WHERE "timestamp" < now() - interval '7 days';

-- 3. Hapus manual sekali jalan (opsional).
-- SELECT public.purge_old_audit_logs(7);

-- 4. Jadwalkan otomatis tiap hari pukul 03:00 WIB.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-audit-logs-7d') THEN
        PERFORM cron.unschedule('purge-audit-logs-7d');
    END IF;
END;
$$;

SELECT cron.schedule(
    'purge-audit-logs-7d',
    '0 20 * * *',
    $$SELECT public.purge_old_audit_logs(7);$$
);

-- 5. Cek riwayat eksekusi.
-- SELECT jobid, jobname, schedule, command, active FROM cron.job;
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- 6. Batalkan jadwal bila tidak dipakai.
-- SELECT cron.unschedule('purge-audit-logs-7d');