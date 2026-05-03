-- kitchen_activity table
-- Required columns:
-- id: uuid (PK)
-- created_at: timestamptz (default now())
-- zone_name: text
-- is_active: boolean
-- motion_score: double precision

create table if not exists public.kitchen_activity (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  zone_name text not null,
  is_active boolean not null,
  motion_score double precision not null
);

-- Helpful indexes for time series queries and dashboards
create index if not exists kitchen_activity_created_at_idx
  on public.kitchen_activity (created_at desc);

create index if not exists kitchen_activity_zone_created_at_idx
  on public.kitchen_activity (zone_name, created_at desc);

-- Enable Row Level Security (RLS). You can keep inserts server-side
-- using the service role key (bypasses RLS), and restrict client reads.
alter table public.kitchen_activity enable row level security;

-- Example policy: allow authenticated users to read
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
