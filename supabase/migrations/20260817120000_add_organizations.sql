-- TradeLock — Organizations foundation (Platform v2, Sprint 1)
--
-- Introduces the multi-tenant model described in
-- docs/architecture/09-data-model.md: organizations become the real owner
-- of business data, users become members of one or more organizations.
--
-- This migration is written to apply AFTER all of migrations 10-20 (per
-- AGENTS.md, those are written but not yet applied to the live database).
-- It assumes that state — e.g. change_orders' Phase 8 hardened RLS below
-- is copied from 20260810100000_harden_change_order_rls.sql exactly, with
-- only the ownership predicate swapped from user_id to organization_id.
--
-- Deliberately NOT part of this migration (see chat/Sprint 1 summary for
-- why): moving users.stripe_customer_id / subscription_tier / Connect
-- fields off `users`. Those are copied onto the new organizations rows
-- during backfill so the columns are populated and ready, but every
-- existing billing/Connect/webhook code path keeps reading and writing
-- `users` unchanged until that cutover happens deliberately in a later
-- sprint — rewriting live Stripe integration code in the same migration
-- that introduces multi-tenancy, with no way to test either against a
-- real database from here, is exactly the kind of shortcut this sprint
-- was told not to take.

-- ============================================================================
-- 1. organizations — the tenant
-- ============================================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  business_type text not null default 'contractor'
    check (business_type in (
      'contractor', 'restaurant', 'photography', 'salon', 'cleaning',
      'hvac', 'real_estate', 'gym', 'event_planner', 'retail', 'medical',
      'law_firm', 'consulting', 'manufacturing', 'other'
    )),
  logo_url    text,
  brand_color text,
  country     text not null default 'US',
  timezone    text not null default 'America/New_York',
  owner_id    uuid not null references auth.users (id) on delete restrict,

  -- Copied from users at backfill time for schema completeness (see header
  -- comment) — not yet the code paths' source of truth.
  stripe_customer_id  text,
  subscription_status text default 'inactive',
  stripe_subscription_id text,
  subscription_tier   text not null default 'free'
    check (subscription_tier in ('free', 'pro', 'business')),
  trial_ends_at        timestamptz,
  stripe_account_id    text,
  stripe_connect_charges_enabled boolean not null default false,
  stripe_connect_payouts_enabled boolean not null default false,

  created_at timestamptz not null default now()
);

create index organizations_owner_id_idx on public.organizations (owner_id);

alter table public.organizations enable row level security;

-- Membership check reused across every organization-scoped table below.
-- security definer + a fixed search_path is the standard Supabase pattern
-- for this: it lets the function see all of organization_members without
-- being subject to that table's own RLS, which avoids the self-referential
-- recursion a plain `using` subquery into organization_members would hit
-- when organization_members' own policy calls this same check.
create or replace function public.is_organization_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create policy "Members can view their organizations"
  on public.organizations
  for select
  to authenticated
  using (public.is_organization_member(id));

-- Any authenticated user can create an organization — self-service, same as
-- signup itself. They become the owner of exactly the row they're inserting.
create policy "Users can create organizations they own"
  on public.organizations
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Only the owner can update organization-level settings in Sprint 1 — once
-- organization.manage-style delegated permissions have a real UI on top of
-- them (Sprint 2), this can widen to permission-holders, not just the owner.
create policy "Owners can update their organization"
  on public.organizations
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No delete policy: deleting an organization is destructive enough (cascades
-- through every business table it owns) that it needs a dedicated, guarded
-- flow later, not a bare RLS grant.

-- ============================================================================
-- 2. organization_roles — per-organization roles (seeded + custom)
-- ============================================================================

create table public.organization_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  is_system_role  boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index organization_roles_organization_id_idx on public.organization_roles (organization_id);

alter table public.organization_roles enable row level security;

create policy "Members can view their organization's roles"
  on public.organization_roles
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

-- No authenticated insert/update/delete yet — role management (Milestone 5/6)
-- has no UI to exercise it against yet; every role row today is written by
-- this migration's backfill or, going forward, by createOrganization's
-- service-role seeding step.

-- ============================================================================
-- 3. permissions — global, fixed catalog (not per-organization)
-- ============================================================================

create table public.permissions (
  key         text primary key,
  label       text not null,
  module      text not null default 'core',
  description text
);

alter table public.permissions enable row level security;

-- Readable by anyone signed in — it's a fixed vocabulary list, not sensitive.
create policy "Authenticated users can view the permission catalog"
  on public.permissions
  for select
  to authenticated
  using (true);

insert into public.permissions (key, label, module, description) values
  ('projects.create',     'Can Create Projects',  'core', 'Create new projects'),
  ('projects.edit',       'Can Edit Projects',     'core', 'Edit existing projects'),
  ('projects.delete',     'Can Delete Projects',   'core', 'Delete projects'),
  ('clients.delete',      'Can Delete Clients',    'core', 'Delete client records'),
  ('billing.manage',      'Can Manage Billing',    'core', 'Manage subscription and payment settings'),
  ('payments.approve',    'Can Approve Payments',  'core', 'Approve offline/manual payments'),
  ('payments.refund',     'Can Issue Refunds',     'core', 'Issue refunds on paid change orders'),
  ('reports.view',        'Can View Reports',      'core', 'View financial and activity reports'),
  ('inventory.manage',    'Can Manage Inventory',  'core', 'Manage inventory records'),
  ('users.invite',        'Can Invite Users',      'core', 'Invite new members to the organization'),
  ('modules.install',     'Can Install Modules',   'core', 'Install or remove modules'),
  ('organization.manage', 'Can Manage Organization', 'core', 'Edit organization-level settings');

-- ============================================================================
-- 4. role_permissions — which permissions a role grants
-- ============================================================================

create table public.role_permissions (
  role_id        uuid not null references public.organization_roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

alter table public.role_permissions enable row level security;

create policy "Members can view their organization's role permissions"
  on public.role_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_roles r
      where r.id = role_permissions.role_id
        and public.is_organization_member(r.organization_id)
    )
  );

-- ============================================================================
-- 5. organization_members — people <-> organizations
-- ============================================================================

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  role_id         uuid not null references public.organization_roles (id),
  status          text not null default 'invited'
    check (status in ('invited', 'active', 'suspended')),
  invited_email   text,
  invited_by      uuid references auth.users (id),
  joined_at       timestamptz,
  created_at      timestamptz not null default now()
);

-- Partial unique index rather than a plain unique constraint: user_id is
-- nullable (pending invites have no user yet), and a plain unique constraint
-- treats every NULL as distinct anyway in Postgres, but being explicit here
-- documents that this is intentional, not an oversight.
create unique index organization_members_org_user_unique
  on public.organization_members (organization_id, user_id)
  where user_id is not null;

create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index organization_members_user_id_idx on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- A member can see the full member list of any organization they belong to
-- (not just their own row) — needed for any future "team" view, and RLS
-- still guarantees they can only ever see this for organizations they're
-- actually in.
create policy "Members can view their organization's membership"
  on public.organization_members
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

-- No authenticated insert/update/delete yet — invitations (Milestone 5) have
-- no UI/flow to exercise this against yet. Every row today is written by
-- this migration's backfill or, going forward, createOrganization's
-- service-role seeding step.

-- ============================================================================
-- 6. organization_settings — one flexible JSONB row per organization
-- ============================================================================

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  settings        jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

create policy "Members can view their organization's settings"
  on public.organization_settings
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Owners can update their organization's settings"
  on public.organization_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.organizations o
      where o.id = organization_settings.organization_id
        and o.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = organization_settings.organization_id
        and o.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 7. modules — global catalog, mirrors src/modules/*
-- ============================================================================

create table public.modules (
  slug        text primary key,
  name        text not null,
  description text not null,
  icon        text,
  is_core     boolean not null default false,
  default_for_business_types text[] not null default '{}',
  created_at  timestamptz not null default now()
);

alter table public.modules enable row level security;

create policy "Authenticated users can view the module catalog"
  on public.modules
  for select
  to authenticated
  using (true);

insert into public.modules (slug, name, description, icon, is_core, default_for_business_types) values
  ('projects',   'Projects & Change Orders', 'Project tracking, change orders, and client portal.', 'Hammer',        true,  '{}'),
  ('billing',    'Billing & Subscriptions',  'Subscription plan and payment settings.',              'CreditCard',    true,  '{}'),
  ('messaging',  'Messaging',                'Direct messaging between provider and client.',        'MessageSquare', true,  '{}'),
  ('clients',    'Clients',                  'Standalone client/contact records.',                   'Users',         false, array['contractor','photography','consulting','law_firm']),
  ('crm',        'CRM',                      'Leads, pipeline, and contact management.',             'Contact',       false, array['real_estate','consulting','retail']),
  ('calendar',   'Calendar',                 'Scheduling and appointment booking.',                  'Calendar',      false, array['salon','gym','medical','event_planner']),
  ('events',     'Events',                   'Event, guest, and vendor management.',                 'PartyPopper',   false, array['event_planner']),
  ('automation', 'Automation',               'Workflow automation.',                                 'Zap',           false, '{}'),
  ('templates',  'Templates',                'Reusable document and message templates.',             'FileText',      false, '{}'),
  ('inventory',  'Inventory',                'Stock and materials tracking.',                        'Package',       false, array['restaurant','retail','hvac']),
  ('ai',         'AI Assistant',             'Natural-language assistant.',                          'Sparkles',      false, '{}');

-- ============================================================================
-- 8. organization_modules — per-organization install state
-- ============================================================================

create table public.organization_modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module_slug     text not null references public.modules (slug),
  status          text not null default 'enabled'
    check (status in ('enabled', 'disabled', 'trial')),
  installed_at    timestamptz not null default now(),
  trial_ends_at   timestamptz,
  installed_by    uuid references auth.users (id),
  config          jsonb not null default '{}'::jsonb,
  unique (organization_id, module_slug)
);

create index organization_modules_organization_id_idx on public.organization_modules (organization_id);

alter table public.organization_modules enable row level security;

create policy "Members can view their organization's installed modules"
  on public.organization_modules
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

-- No authenticated insert/update/delete yet — the install/uninstall flow
-- (Milestone 4/8) doesn't exist yet. Rows today come from this migration's
-- backfill or, going forward, createOrganization's service-role seeding.

-- ============================================================================
-- 9. organization_id on existing business tables (nullable first)
-- ============================================================================

alter table public.projects
  add column organization_id uuid references public.organizations (id);

alter table public.change_orders
  add column organization_id uuid references public.organizations (id);

alter table public.terms_of_service
  add column organization_id uuid references public.organizations (id);

-- ============================================================================
-- 10. Backfill — one organization per existing user
-- ============================================================================
--
-- Every existing users row gets its own organization (name from
-- company_name, business_type 'contractor' — the only kind of user that has
-- existed until now), with that user as Owner, the five system/template
-- roles seeded, Owner granted every permission, and their existing
-- projects/change_orders/terms_of_service re-pointed at the new
-- organization_id. Until Milestone 10 ships real multi-org switching, this
-- keeps the product behaving identically to today from the outside — every
-- user still has exactly one organization.

do $$
declare
  u record;
  new_org_id       uuid;
  owner_role_id    uuid;
  manager_role_id  uuid;
  employee_role_id uuid;
  bookkeeper_role_id uuid;
  sales_role_id    uuid;
begin
  for u in select * from public.users loop
    insert into public.organizations (
      name, slug, business_type, owner_id,
      stripe_customer_id, subscription_status, stripe_subscription_id,
      subscription_tier, trial_ends_at, stripe_account_id,
      stripe_connect_charges_enabled, stripe_connect_payouts_enabled
    ) values (
      coalesce(nullif(u.company_name, ''), 'My Business'),
      'org-' || replace(u.id::text, '-', ''),
      'contractor',
      u.id,
      u.stripe_customer_id,
      coalesce(u.subscription_status, 'inactive'),
      u.stripe_subscription_id,
      coalesce(u.subscription_tier, 'free'),
      u.trial_ends_at,
      u.stripe_account_id,
      coalesce(u.stripe_connect_charges_enabled, false),
      coalesce(u.stripe_connect_payouts_enabled, false)
    )
    returning id into new_org_id;

    insert into public.organization_roles (organization_id, name, is_system_role)
      values (new_org_id, 'Owner', true) returning id into owner_role_id;
    insert into public.organization_roles (organization_id, name, is_system_role)
      values (new_org_id, 'Manager', false) returning id into manager_role_id;
    insert into public.organization_roles (organization_id, name, is_system_role)
      values (new_org_id, 'Employee', false) returning id into employee_role_id;
    insert into public.organization_roles (organization_id, name, is_system_role)
      values (new_org_id, 'Bookkeeper', false) returning id into bookkeeper_role_id;
    insert into public.organization_roles (organization_id, name, is_system_role)
      values (new_org_id, 'Sales', false) returning id into sales_role_id;

    -- Owner: every permission in the catalog.
    insert into public.role_permissions (role_id, permission_key)
      select owner_role_id, key from public.permissions;

    -- Everyday-operations role: project/client work, approvals, reports.
    insert into public.role_permissions (role_id, permission_key) values
      (manager_role_id, 'projects.create'),
      (manager_role_id, 'projects.edit'),
      (manager_role_id, 'projects.delete'),
      (manager_role_id, 'clients.delete'),
      (manager_role_id, 'payments.approve'),
      (manager_role_id, 'reports.view'),
      (manager_role_id, 'inventory.manage'),
      (manager_role_id, 'users.invite');

    -- Baseline operational role: create/edit their own work, view reports.
    insert into public.role_permissions (role_id, permission_key) values
      (employee_role_id, 'projects.create'),
      (employee_role_id, 'projects.edit'),
      (employee_role_id, 'reports.view');

    -- Financial role: billing and payments, no project/client management.
    insert into public.role_permissions (role_id, permission_key) values
      (bookkeeper_role_id, 'billing.manage'),
      (bookkeeper_role_id, 'payments.approve'),
      (bookkeeper_role_id, 'payments.refund'),
      (bookkeeper_role_id, 'reports.view');

    -- Pipeline-facing role: create projects, view reports.
    insert into public.role_permissions (role_id, permission_key) values
      (sales_role_id, 'projects.create'),
      (sales_role_id, 'reports.view');

    insert into public.organization_members (organization_id, user_id, role_id, status, joined_at)
      values (new_org_id, u.id, owner_role_id, 'active', now());

    insert into public.organization_settings (organization_id) values (new_org_id);

    insert into public.organization_modules (organization_id, module_slug, status)
      select new_org_id, slug, 'enabled' from public.modules where is_core;

    update public.projects set organization_id = new_org_id where user_id = u.id;
    update public.change_orders set organization_id = new_org_id
      where project_id in (select id from public.projects where user_id = u.id);
    update public.terms_of_service set organization_id = new_org_id where user_id = u.id;
  end loop;
end $$;

-- Any project/change_order/terms_of_service row whose owning user somehow
-- predates this backfill (shouldn't happen — the loop above covers every
-- users row) would fail the NOT NULL constraints below loudly rather than
-- silently, which is the correct failure mode for a data-integrity gap.
alter table public.projects
  alter column organization_id set not null;
alter table public.change_orders
  alter column organization_id set not null;
alter table public.terms_of_service
  alter column organization_id set not null;

create index projects_organization_id_idx on public.projects (organization_id);
create index change_orders_organization_id_idx on public.change_orders (organization_id);
create index terms_of_service_organization_id_idx on public.terms_of_service (organization_id);

-- ============================================================================
-- 11. RLS: swap ownership predicate from user_id to organization membership
-- ============================================================================
--
-- Every organization has exactly one active member (its owner) until
-- Milestone 10 ships real invitations, so this is behaviorally identical to
-- the user_id checks it replaces for every row that exists today — it's
-- forward-compatible groundwork, not a behavior change yet.

-- --- projects ---------------------------------------------------------------

drop policy if exists "Providers can view own projects" on public.projects;
create policy "Members can view organization projects"
  on public.projects
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists "Providers can insert own projects" on public.projects;
create policy "Members can insert organization projects"
  on public.projects
  for insert
  to authenticated
  with check (public.is_organization_member(organization_id));

drop policy if exists "Providers can update own projects" on public.projects;
create policy "Members can update organization projects"
  on public.projects
  for update
  to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

drop policy if exists "Providers can delete own projects" on public.projects;
create policy "Members can delete organization projects"
  on public.projects
  for delete
  to authenticated
  using (public.is_organization_member(organization_id));

-- Client magic-link policy is untouched — token-based, not ownership-based.

-- --- change_orders -----------------------------------------------------------
--
-- Column-level grants from 20260810100000_harden_change_order_rls.sql are
-- NOT touched by this migration — only the three policies' ownership
-- predicate changes, from "project belongs to a project owned by
-- auth.uid()" to "project belongs to an organization auth.uid() is an
-- active member of". Every column restriction, every status='pending'
-- restriction, stays byte-for-byte the same.

drop policy if exists "Providers can view own change orders" on public.change_orders;
create policy "Members can view organization change orders"
  on public.change_orders
  for select
  to authenticated
  using (public.is_organization_member(change_orders.organization_id));

drop policy if exists "Providers can insert own change orders" on public.change_orders;
create policy "Members can insert organization change orders"
  on public.change_orders
  for insert
  to authenticated
  with check (public.is_organization_member(change_orders.organization_id));

drop policy if exists "Providers can update own pending change orders" on public.change_orders;
create policy "Members can update organization pending change orders"
  on public.change_orders
  for update
  to authenticated
  using (
    status = 'pending'
    and public.is_organization_member(change_orders.organization_id)
  )
  with check (
    status = 'pending'
    and public.is_organization_member(change_orders.organization_id)
  );

drop policy if exists "Providers can delete own pending change orders" on public.change_orders;
create policy "Members can delete organization pending change orders"
  on public.change_orders
  for delete
  to authenticated
  using (
    status = 'pending'
    and public.is_organization_member(change_orders.organization_id)
  );

-- Column-level GRANT/REVOKE statements from the Phase 8 migration remain in
-- effect untouched — this migration does not reissue them.

-- Client magic-link SELECT policy is untouched — token-based, not
-- ownership-based.

-- --- terms_of_service ---------------------------------------------------------

drop policy if exists "Providers can view own terms versions" on public.terms_of_service;
create policy "Members can view organization terms versions"
  on public.terms_of_service
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists "Providers can insert own terms versions" on public.terms_of_service;
create policy "Members can insert organization terms versions"
  on public.terms_of_service
  for insert
  to authenticated
  with check (public.is_organization_member(organization_id));

drop policy if exists "Providers can update own terms versions" on public.terms_of_service;
create policy "Members can update organization terms versions"
  on public.terms_of_service
  for update
  to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
