-- ==============================================================================
-- SYNC ENGINE HANTARAN
-- Jalankan sekali di Supabase SQL Editor SETELAH disetujui.
-- Migration ini idempoten (aman diulang) karena memakai IF NOT EXISTS.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Penanda baris yang masih muncul di spreadsheet
ALTER TABLE public.asset_requests
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.request_orders
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_asset_requests_stale
  ON public.asset_requests(is_stale) WHERE is_stale = TRUE;
CREATE INDEX IF NOT EXISTS idx_request_orders_stale
  ON public.request_orders(is_stale) WHERE is_stale = TRUE;

-- 2. Satu baris per eksekusi engine
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  actor_name TEXT,
  total_sources INTEGER NOT NULL DEFAULT 0,
  ok_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  message TEXT
);

-- Hanya boleh ada satu run aktif pada satu waktu.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sync_runs_running
  ON public.sync_runs(status) WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS idx_sync_runs_started
  ON public.sync_runs(started_at DESC);

-- 3. Detail per sumber per run
CREATE TABLE IF NOT EXISTS public.sync_run_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL,
  rows_fetched INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_stale INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_run_sources_run
  ON public.sync_run_sources(run_id);

-- 4. Hanya service role yang perlu mengakses tabel operasional ini.
--    RLS aktif tanpa policy berarti anon/authenticated tidak bisa membaca/menulis.
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_run_sources ENABLE ROW LEVEL SECURITY;

-- 5. Cek aman sebelum apply (read-only)
SELECT count(*) AS jumlah_sync_runs FROM public.sync_runs;
SELECT count(*) AS jumlah_sync_run_sources FROM public.sync_run_sources;