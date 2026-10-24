-- ==============================================================================
-- Migrasi: kolom password untuk fitur Ubah Password mandiri
-- Aman dijalankan berulang. Password lama yang masih tersimpan di kolom
-- `phone` tetap dibaca sebagai fallback oleh aplikasi.
-- ==============================================================================
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS password TEXT;

COMMENT ON COLUMN public.user_profiles.password IS
    'Password login pengguna. Nilai lama di kolom phone tetap dipakai sebagai fallback sebelum pengguna mengganti password.';

-- Rollback (hanya setelah kode aplikasi lama dipulihkan):
-- 1. Salin password baru ke kolom fallback agar pengguna tidak kehilangan akses:
--    UPDATE public.user_profiles SET phone = password WHERE password IS NOT NULL;
-- 2. Hapus kolom:
--    ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS password;
