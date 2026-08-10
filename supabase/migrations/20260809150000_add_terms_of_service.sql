-- TradeLock — Editable, versioned Terms of Service (Phase 7)
--
-- Purpose-built table rather than a generic key/value "settings" table:
-- the only setting asked for is ToS text, and it specifically needs
-- versioning (see below), which a generic settings row wouldn't give us
-- for free. Per-provider (public.users), not a single site-wide ToS.
--
-- Versioned rather than a single mutable column on `users`: this app's
-- whole premise is eliminating "he-said-she-said" disputes, so silently
-- overwriting ToS text a client already agreed to would undermine that —
-- every acceptance must keep pointing at the exact text that was in force
-- when it was accepted, even after the provider later edits their terms.

create table public.terms_of_service (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  version    integer not null,
  content    text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create index terms_of_service_user_id_idx on public.terms_of_service (user_id);

-- Database-level guarantee that publishing a new version can never leave
-- two versions simultaneously active for the same provider, regardless of
-- what the Server Action does.
create unique index terms_of_service_one_active_per_user
  on public.terms_of_service (user_id)
  where is_active;

alter table public.terms_of_service enable row level security;

create policy "Providers can view own terms versions"
  on public.terms_of_service
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Providers can insert own terms versions"
  on public.terms_of_service
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Providers can update own terms versions"
  on public.terms_of_service
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No policy for anon/client reads — same as projects/change_orders, the
-- client portal reads through the service-role client after validating the
-- magic-link token itself (see app/p/[token]/actions.ts and page.tsx).

-- Audit trail: which version (if any) was shown and accepted, and when,
-- captured at the moment of signing alongside the existing signature/status
-- fields — not a separate table, since it's inherently 1:1 with a signing
-- event.
alter table public.change_orders
  add column terms_version_id  uuid references public.terms_of_service (id),
  add column terms_accepted_at timestamptz;
