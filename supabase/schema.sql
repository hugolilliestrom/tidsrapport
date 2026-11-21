-- Steg 3 — Supabase schema (kör en gång i SQL Editor)
-- Service role används server-side; RLS på, inga public policies.

-- ─── months ───────────────────────────────────────────────────────────────
create table if not exists public.months (
  month_key text primary key,
  name text not null default 'Hugo Lillieström',
  project text not null default '',
  work_percentage integer not null default 40
    check (work_percentage > 0 and work_percentage <= 100),
  manual_carryover_minutes integer,
  day_offs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on column public.months.month_key is 'YYYY-MM';
comment on column public.months.manual_carryover_minutes is 'null = auto från föregående månad';
comment on column public.months.day_offs is 'Map date(YYYY-MM-DD) → true för manuell ledig dag';

-- ─── tasks ────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id text primary key,
  month_key text not null references public.months (month_key) on delete cascade,
  date date not null,
  toggl_id text,
  category text not null default '',
  description text not null default '',
  minutes integer not null default 0 check (minutes >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists tasks_toggl_id_uidx
  on public.tasks (toggl_id)
  where toggl_id is not null;

create index if not exists tasks_month_key_idx on public.tasks (month_key);
create index if not exists tasks_date_idx on public.tasks (date);

-- ─── invoice_items ────────────────────────────────────────────────────────
create table if not exists public.invoice_items (
  id text primary key,
  month_key text not null references public.months (month_key) on delete cascade,
  date date not null,
  toggl_id text,
  client text not null default '',
  description text not null default '',
  minutes integer not null default 0 check (minutes >= 0),
  hourly_rate numeric(12, 2),
  include_in_flex boolean not null default false,
  invoiced boolean not null default false,
  invoiced_date date,
  invoice_number text,
  created_at timestamptz not null default now()
);

create unique index if not exists invoice_items_toggl_id_uidx
  on public.invoice_items (toggl_id)
  where toggl_id is not null;

create index if not exists invoice_items_month_key_idx
  on public.invoice_items (month_key);

-- ─── updated_at trigger ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists months_updated_at on public.months;
create trigger months_updated_at
  before update on public.months
  for each row execute function public.set_updated_at();

-- ─── Privileges (PostgREST behöver GRANT även för service_role) ───────────
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.months to postgres, service_role;
grant all on table public.tasks to postgres, service_role;
grant all on table public.invoice_items to postgres, service_role;
-- Inga SELECT/INSERT för anon/authenticated — bara service_role via API.

-- ─── RLS: stäng ute anon/authenticated; endast service_role (bypass) ───────
alter table public.months enable row level security;
alter table public.tasks enable row level security;
alter table public.invoice_items enable row level security;

-- Inga policies för anon/authenticated → åtkomst endast via service role
-- från Next.js API-routes (SUPABASE_SERVICE_ROLE_KEY).
