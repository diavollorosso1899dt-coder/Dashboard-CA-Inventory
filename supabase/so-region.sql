-- SO Harian per region
-- Jalankan sekali di Supabase Dashboard -> SQL Editor.

alter table public.so_sessions
  add column if not exists region text;

create index if not exists so_sessions_region_tanggal_idx
  on public.so_sessions (region, tanggal desc);

comment on column public.so_sessions.region is
  'JABODETABEK atau KALBAR. NULL untuk sesi lama sebelum pemisahan region.';
