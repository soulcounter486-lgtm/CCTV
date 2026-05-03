-- Notes for deploying the internet dashboard (Vercel) with login required.
--
-- Recommended split:
-- - Python collector (server): insert with SERVICE ROLE key
-- - Dashboard (browser): read with ANON key + user login (authenticated)
--
-- 1) RLS for authenticated read
alter table public.kitchen_activity enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kitchen_activity'
      and policyname = 'allow_authenticated_read'
  ) then
    create policy allow_authenticated_read
      on public.kitchen_activity
      for select
      to authenticated
      using (true);
  end if;
end$$;

-- 2) (Optional) If you insist on inserting from anon (NOT recommended), you'd need:
-- create policy allow_anon_insert on public.kitchen_activity
--   for insert to anon with check (true);
--
-- 3) Realtime
-- In Supabase Console: Database -> Replication (Realtime) -> add public.kitchen_activity
