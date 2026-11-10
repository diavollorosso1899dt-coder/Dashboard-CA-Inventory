-- Master Asset Additions dari RO
-- Item aset yang ada di Kelola RO tetapi belum ada di master aset / master stok SO.
-- Jalankan sekali di Supabase SQL Editor.

create table if not exists public.master_asset_additions (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('JABODETABEK', 'KALBAR')),
  item_name text not null,
  normalized_name text not null,
  sku text,
  unit text not null default 'unit',
  classification text not null default 'Perlengkapan Tetap',
  specification text,
  photo_url text,
  source text not null default 'RO',
  source_ro_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region, normalized_name)
);

create index if not exists master_asset_additions_region_active_idx
  on public.master_asset_additions (region, is_active);

alter table public.master_asset_additions enable row level security;

comment on table public.master_asset_additions is
  'Item master tambahan dari RO yang disimpan di Supabase, bukan di Google Sheets.';
