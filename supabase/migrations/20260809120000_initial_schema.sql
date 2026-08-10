-- TradeLock — Initial schema (Phase 2)
-- Tables: users (providers), projects, change_orders
-- Includes RLS so providers only see their own data, and clients can reach
-- exactly one project/change-order set via an unguessable magic-link token.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users (providers/contractors)
-- 1:1 extension of auth.users, per Supabase convention. Row is created by
-- the app right after sign-up (auth.uid() = id at insert time).
-- ---------------------------------------------------------------------------
create table public.users (
  id                 uuid primary key references auth.users (id) on delete cascade,
  company_name       text,
  email              text,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Providers can view own user record"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Providers can insert own user record"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Providers can update own user record"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- projects
-- Owned by a provider (users.id). unique_token is the magic-link secret that
-- gates client access to /app/p/[token] — treat it as a bearer credential.
-- ---------------------------------------------------------------------------
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  client_name      text not null,
  client_email     text,
  property_address text,
  unique_token     uuid not null unique default gen_random_uuid(),
  created_at       timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

-- Providers: full CRUD, but only on projects they own.
create policy "Providers can view own projects"
  on public.projects
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Providers can insert own projects"
  on public.projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Providers can update own projects"
  on public.projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Providers can delete own projects"
  on public.projects
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Clients (unauthenticated homeowners): can read exactly one project — the
-- one whose unique_token matches an `x-portal-token` request header. This is
-- a real per-row RLS check, not a blanket `using (true)`, so a client who
-- knows one token still cannot enumerate or read any other project.
-- The Next.js portal route must set this header when creating its Supabase
-- client, e.g. `createClient(url, anonKey, { global: { headers: { 'x-portal-token': token } } })`.
create policy "Clients can view their project via magic-link token"
  on public.projects
  for select
  to anon, authenticated
  using (
    unique_token::text = coalesce(current_setting('request.headers', true)::json ->> 'x-portal-token', '')
  );

-- ---------------------------------------------------------------------------
-- change_orders
-- Belongs to a project. Homeowners approve extra work here by supplying a
-- base64-encoded signature captured from an HTML5 canvas (Phase 5).
-- ---------------------------------------------------------------------------
create table public.change_orders (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  description    text not null,
  cost           numeric(10, 2) not null check (cost >= 0),
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'declined', 'paid')),
  signature_data text,
  signed_at      timestamptz,
  created_at     timestamptz not null default now()
);

create index change_orders_project_id_idx on public.change_orders (project_id);

alter table public.change_orders enable row level security;

-- Providers: full CRUD on change orders that belong to their own projects.
create policy "Providers can view own change orders"
  on public.change_orders
  for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Providers can insert own change orders"
  on public.change_orders
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Providers can update own change orders"
  on public.change_orders
  for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Providers can delete own change orders"
  on public.change_orders
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );

-- Clients: can read change orders for the single project their magic-link
-- token unlocks (same `x-portal-token` header check as above). Writing a
-- signature back (Phase 5: client signs + pays) will need its own narrowly
-- scoped update policy, added when that flow is built.
create policy "Clients can view change orders via magic-link token"
  on public.change_orders
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.unique_token::text = coalesce(current_setting('request.headers', true)::json ->> 'x-portal-token', '')
    )
  );
