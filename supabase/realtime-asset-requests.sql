-- Enable Supabase Realtime (Postgres Changes) for asset_requests.
-- Run this once in the Supabase SQL editor.
--
-- The table already has a public SELECT policy. Realtime uses the anon role in
-- the browser, so only a SELECT grant is added here. No write access is added.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'asset_requests'
  ) then
    alter publication supabase_realtime add table public.asset_requests;
  end if;
end $$;

grant select on table public.asset_requests to anon, authenticated;

-- Verification (optional):
-- select schemaname, tablename
-- from pg_publication_tables
-- where pubname = 'supabase_realtime' and tablename = 'asset_requests';

-- Rollback (optional):
-- alter publication supabase_realtime drop table public.asset_requests;
-- revoke select on table public.asset_requests from anon, authenticated;
