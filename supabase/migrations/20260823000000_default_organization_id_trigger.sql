-- TradeLock — Backwards-compatibility trigger for organization_id
--
-- Problem (confirmed live, reproduced end-to-end with a throwaway account):
-- main (the branch currently deployed to production) predates the Sprint 1
-- organizations migration and never sets organization_id when inserting
-- into projects/change_orders/terms_of_service. Since 20260817120000 made
-- organization_id NOT NULL and swapped these tables' RLS policies to
-- is_organization_member(organization_id), an insert with no organization_id
-- now fails RLS's WITH CHECK outright (is_organization_member(null) is
-- false) before the NOT NULL constraint is even reached — error 42501,
-- "new row violates row-level security policy". Real users on the
-- currently-deployed app cannot create projects, change orders, or
-- terms-of-service versions right now.
--
-- Fix: BEFORE INSERT triggers that fill in organization_id only when the
-- inserting statement left it null — main's old code paths get a working
-- default transparently, and platform-v2's code (which always sets
-- organization_id explicitly via asOrgClient) is completely unaffected,
-- since the "is null" guard never fires for it. Safe to leave in place
-- permanently after platform-v2 replaces main — it simply goes dormant.
--
-- All DDL below is idempotent (create or replace / drop-if-exists +
-- create), safe to paste more than once.

-- ============================================================================
-- 1. resolve_default_organization_id — mirrors ensureDefaultOrganization /
--    createOrganization (src/core/organizations/service.ts) exactly: reuse
--    an existing active membership if one exists, otherwise create a full
--    default organization (org row, five system roles + their permission
--    grants, Owner membership, empty settings row, core modules) — the same
--    shape the Sprint 1 backfill produced for every pre-existing user.
-- ============================================================================

create or replace function public.resolve_default_organization_id(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org_id    uuid;
  new_org_id         uuid;
  owner_role_id      uuid;
  manager_role_id    uuid;
  employee_role_id   uuid;
  bookkeeper_role_id uuid;
  sales_role_id      uuid;
  org_name           text;
begin
  -- 1. Reuse an existing active membership if the user already has one
  -- (mirrors listOrganizationsForUser's existing-org path in
  -- ensureDefaultOrganization). Ordered by joined_at to match the
  -- application-layer "first organization" convention.
  select organization_id into existing_org_id
  from public.organization_members
  where user_id = p_user_id and status = 'active'
  order by joined_at asc
  limit 1;

  if existing_org_id is not null then
    return existing_org_id;
  end if;

  -- 2. Otherwise create one, identical in shape to createOrganization() /
  -- the Sprint 1 backfill's per-user loop.
  select coalesce(nullif(u.company_name, ''), 'My Business')
  into org_name
  from public.users u
  where u.id = p_user_id;

  insert into public.organizations (name, slug, business_type, owner_id)
  values (
    coalesce(org_name, 'My Business'),
    'org-' || replace(p_user_id::text, '-', ''),
    'contractor',
    p_user_id
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

  -- Same per-role permission grants as 20260817120000's backfill.
  insert into public.role_permissions (role_id, permission_key)
    select owner_role_id, key from public.permissions;

  insert into public.role_permissions (role_id, permission_key) values
    (manager_role_id, 'projects.create'),
    (manager_role_id, 'projects.edit'),
    (manager_role_id, 'projects.delete'),
    (manager_role_id, 'clients.delete'),
    (manager_role_id, 'payments.approve'),
    (manager_role_id, 'reports.view'),
    (manager_role_id, 'inventory.manage'),
    (manager_role_id, 'users.invite');

  insert into public.role_permissions (role_id, permission_key) values
    (employee_role_id, 'projects.create'),
    (employee_role_id, 'projects.edit'),
    (employee_role_id, 'reports.view');

  insert into public.role_permissions (role_id, permission_key) values
    (bookkeeper_role_id, 'billing.manage'),
    (bookkeeper_role_id, 'payments.approve'),
    (bookkeeper_role_id, 'payments.refund'),
    (bookkeeper_role_id, 'reports.view');

  insert into public.role_permissions (role_id, permission_key) values
    (sales_role_id, 'projects.create'),
    (sales_role_id, 'reports.view');

  insert into public.organization_members (organization_id, user_id, role_id, status, joined_at)
    values (new_org_id, p_user_id, owner_role_id, 'active', now());

  insert into public.organization_settings (organization_id) values (new_org_id);

  insert into public.organization_modules (organization_id, module_slug, status)
    select new_org_id, slug, 'enabled' from public.modules where is_core;

  return new_org_id;
end;
$$;

-- ============================================================================
-- 2. Triggers — only fire the fallback when organization_id was left null.
-- ============================================================================

create or replace function public.projects_default_organization_id()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.resolve_default_organization_id(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_default_organization_id_trigger on public.projects;
create trigger projects_default_organization_id_trigger
  before insert on public.projects
  for each row execute function public.projects_default_organization_id();

create or replace function public.terms_of_service_default_organization_id()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.resolve_default_organization_id(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists terms_of_service_default_organization_id_trigger on public.terms_of_service;
create trigger terms_of_service_default_organization_id_trigger
  before insert on public.terms_of_service
  for each row execute function public.terms_of_service_default_organization_id();

-- change_orders has no user_id of its own — inherit the parent project's
-- organization_id directly rather than re-deriving it from an owner lookup.
-- The parent project is guaranteed to already have organization_id set
-- (NOT NULL, and any legacy insert reaching this point already passed
-- through the projects trigger above at project-creation time).
create or replace function public.change_orders_default_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.projects
    where id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists change_orders_default_organization_id_trigger on public.change_orders;
create trigger change_orders_default_organization_id_trigger
  before insert on public.change_orders
  for each row execute function public.change_orders_default_organization_id();
