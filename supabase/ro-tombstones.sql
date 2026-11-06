-- Tombstone baris: kunci yang dihapus manual dan tidak boleh masuk lagi lewat sync.
-- Jalankan sekali di Supabase -> SQL Editor. Aman dijalankan berulang.
--
-- Kenapa perlu: penanda hapus sebelumnya hanya hidup di memori proses server,
-- sehingga hilang setiap redeploy dan RO yang sudah dihapus muncul kembali
-- pada sync berikutnya.

create table if not exists public.sync_tombstones (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  row_key text not null,
  display_key text,
  entity_table text not null default 'request_orders',
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint sync_tombstones_source_key_row_key_key unique (source_key, row_key)
);

create index if not exists sync_tombstones_source_created_idx
  on public.sync_tombstones (source_key, created_at desc);

alter table public.sync_tombstones enable row level security;

-- Hanya service role (server) yang boleh membaca/menulis. Tanpa policy RLS,
-- anon dan authenticated tidak bisa melihat isi tabel ini.
revoke all on public.sync_tombstones from anon, authenticated;
grant all on public.sync_tombstones to service_role;

comment on table public.sync_tombstones is
  'Kunci baris yang dihapus manual; sync melewati baris ini agar tidak masuk lagi.';