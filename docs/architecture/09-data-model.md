# Data Model

This is the concrete schema behind [04-database.md](./04-database.md)'s philosophy. It defines every table Phase 2 (Organizations) introduces, how they relate, and how the existing production schema migrates into it.

Nothing here is applied yet. This is the design to lock in before any migration is written.

---

## Entity Flow

```
                 auth.users
                     │
                     ▼
           organization_members ──────► organization_roles ──► role_permissions ──► permissions
                     │                                              (catalog)
                     ▼
               organizations ───────► organization_settings
                     │
                     ▼
              organization_modules ──────► modules (catalog)
                     │
                     ▼
              Business Data
        (projects, change_orders,
         clients, terms_of_service, …)
```

A person (`auth.users`) can belong to many organizations. An organization has many members, one settings blob, a set of installed modules, and owns all business data. Nothing below `organizations` in this diagram is ever owned by a user directly — this is the one rule everything else follows.

---

## Tables

### `organizations`

The tenant. One row per business/workspace.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `name` | text | Display name from the creation wizard |
| `slug` | text, unique | URL-safe, reserved for future custom routes |
| `business_type` | text | `contractor`, `restaurant`, `photography`, `salon`, `cleaning`, `hvac`, `real_estate`, `gym`, `event_planner`, `retail`, `medical`, `law_firm`, `consulting`, `manufacturing`, `other` |
| `logo_url` | text, nullable | |
| `brand_color` | text, nullable | |
| `country` | text | |
| `timezone` | text | |
| `owner_id` | uuid → auth.users | Creator; also gets an `organization_members` row with the Owner role |
| `stripe_customer_id` | text, nullable | **Moved from `users`** — subscription billing is per-organization |
| `subscription_status` | text | **Moved from `users`** |
| `stripe_subscription_id` | text, nullable | **Moved from `users`** |
| `subscription_tier` | text, nullable | **Moved from `users`** |
| `trial_ends_at` | timestamptz, nullable | **Moved from `users`** |
| `stripe_account_id` | text, nullable | **Moved from `users`** — Connect is per-business, not per-person |
| `stripe_connect_charges_enabled` | boolean | **Moved from `users`** |
| `stripe_connect_payouts_enabled` | boolean | **Moved from `users`** |
| `created_at` | timestamptz | |

**Why billing/Connect moves here, not stays on `users`:** the current model conflates "the person who signed up" with "the business being paid." Once a user can belong to multiple organizations (Milestone 10 — Ty Construction, Ty Events, Ty Photography under one login), each of those needs its *own* subscription and its *own* Connect payout account. Platform ToS acceptance stays on `users` — that's a legal acceptance by a person, not a business.

---

### `organization_members`

Join table between people and organizations. This is what "belonging to an org" means.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `organization_id` | uuid → organizations | |
| `user_id` | uuid → auth.users, nullable | Null until an invited email accepts |
| `role_id` | uuid → organization_roles | |
| `status` | text | `invited`, `active`, `suspended` |
| `invited_email` | text, nullable | Set when inviting someone without an account yet |
| `invited_by` | uuid → auth.users, nullable | |
| `joined_at` | timestamptz, nullable | |
| `created_at` | timestamptz | |

Unique on `(organization_id, user_id)` where `user_id` is not null.

---

### `organization_roles`

Every organization gets its own role rows — seeded from system templates at creation (Owner, Manager, Employee, Bookkeeper, Sales), plus whatever custom roles the org creates. Keeping roles per-organization (rather than global rows referenced everywhere) means an org can freely rename or delete its own custom roles without touching a shared table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `organization_id` | uuid → organizations | |
| `name` | text | e.g. "Owner", "Manager", "Site Foreman" |
| `is_system_role` | boolean | `true` for the seeded Owner role — can't be deleted or stripped of permissions |
| `created_at` | timestamptz | |

---

### `permissions`

A **global, fixed catalog** — not per-organization. This is the vocabulary every role draws from, seeded once by the platform, not editable by tenants.

| Column | Type | Notes |
|---|---|---|
| `key` | text, pk | e.g. `projects.create`, `projects.delete`, `clients.delete`, `billing.manage`, `payments.refund`, `users.invite`, `modules.install` |
| `label` | text | Human-readable, e.g. "Can Delete Projects" |
| `module` | text | Which module this belongs to — `core` for platform-level permissions, otherwise a module slug |
| `description` | text, nullable | |

Initial seed set seeds directly from what's already specified in [05-permissions.md](./05-permissions.md): create/delete/edit projects, delete clients, manage billing, refund payments, invite users, install modules, view reports, manage inventory, approve payments, manage organization.

---

### `role_permissions`

Which permissions a role grants. This is the entire "role = collection of permissions" model from 05-permissions.md — there is no separate roles-have-a-tier concept, just this join table.

| Column | Type | Notes |
|---|---|---|
| `role_id` | uuid → organization_roles | |
| `permission_key` | text → permissions.key | |

Unique on `(role_id, permission_key)`.

---

### `organization_settings`

One row per organization, flexible JSONB rather than rigid columns — settings sprawl (business hours, invoice numbering, default currency, address) shouldn't require a migration every time a module needs a new preference.

| Column | Type | Notes |
|---|---|---|
| `organization_id` | uuid, pk → organizations | 1:1 |
| `settings` | jsonb | `{}` default |
| `updated_at` | timestamptz | |

---

### `modules`

The global catalog of every module that exists in the platform — the database mirror of the `src/modules/*` folders, and what `moduleRegistry` in [registry.ts](../../src/modules/core/registry.ts) will populate itself from.

| Column | Type | Notes |
|---|---|---|
| `slug` | text, pk | `core`, `projects`, `clients`, `billing`, `crm`, `calendar`, `events`, `automation`, `templates`, `inventory`, `messaging`, `ai` |
| `name` | text | |
| `description` | text | |
| `icon` | text, nullable | Lucide icon name |
| `is_core` | boolean | `true` for infrastructure modules always enabled, never shown in the marketplace |
| `default_for_business_types` | text[] | Drives the Workspace Builder — which business types get this module pre-installed |
| `created_at` | timestamptz | |

---

### `organization_modules`

Which modules a specific organization has installed — the per-tenant state that `organization_modules` + `modules` together answer "what does this business's app look like."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, pk | |
| `organization_id` | uuid → organizations | |
| `module_slug` | text → modules.slug | |
| `status` | text | `enabled`, `disabled`, `trial` |
| `installed_at` | timestamptz | |
| `trial_ends_at` | timestamptz, nullable | |
| `installed_by` | uuid → auth.users, nullable | |
| `config` | jsonb | Module-specific settings, default `{}` |

Unique on `(organization_id, module_slug)`.

---

## Navigation & Dashboard: a deliberate non-table

The diagram in your message shows Navigation Builder and Dashboard as boxes in the flow, but I'm proposing neither gets its own database table. Instead:

- Each module folder under `src/modules/<slug>` exports a manifest (nav items it contributes, dashboard widgets it contributes) as plain TypeScript, registered into `moduleRegistry`.
- At request time, the app reads `organization_modules` for that org, filters the static manifest list down to what's `enabled`, and renders that.

**Why not a database-driven nav/widget system:** nav items and widgets are UI structure tied 1:1 to code that has to exist anyway (a "Clients" nav link is meaningless without a Clients page behind it). Storing that structure in the database would mean every new module ships a code change *and* a data migration for the same information, and risks nav entries pointing at pages that don't exist. The database's job is only to say **which modules are on** — `organization_modules` — not what those modules look like.

If a future module genuinely needs runtime-configurable widgets (e.g. a user reordering their dashboard), that's a much smaller `organization_dashboard_layout` table (org_id, widget_id, position) layered on top later — not a reason to make the whole nav/dashboard system data-driven now.

---

## Migration path from the current schema

This matters because there's a live app on the other side of this branch. Nothing here breaks it — this is the plan for when Phase 2 actually gets built, not something to run today.

1. **Create `organizations` for every existing user.** One organization per current `users` row, `business_type = 'contractor'`, name = their `company_name`. `owner_id` = that user. This is a backfill, not a breaking change.
2. **Add `organization_id` to `projects`, `change_orders`, `terms_of_service`** as nullable at first, backfill from the new 1:1 organization, then make it `NOT NULL` once backfilled. `user_id` columns can stay for now (creator/audit trail) even after `organization_id` becomes the real ownership key.
3. **Move billing/Connect columns from `users` to `organizations`** (copy, then eventually drop from `users` once everything reads from the new location). Existing Stripe customer IDs and connected account IDs carry over as-is — Stripe doesn't need to know anything changed.
4. **Give every backfilled organization an Owner role** in `organization_roles` with every permission in `role_permissions`, and an `organization_members` row linking the original user as Owner.
5. Only after all four are done does Milestone 10 (multi-org, org switching) become meaningful — until then, every user has exactly one organization, so the product behaves identically to today from the outside.

---

## Row-Level Security pattern

Every RLS policy on business data changes from:

```sql
user_id = auth.uid()
```

to:

```sql
organization_id IN (
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND status = 'active'
)
```

The client portal's existing pattern is unaffected — it never relied on RLS in the first place (service-role client + `unique_token` lookup, per [Key patterns] in CLAUDE.md), so nothing here changes how `/p/[token]` works.

---

## Explicitly deferred

Not part of this doc, on purpose — these come after the model above is confirmed:

- Actual SQL migration file
- TypeScript types in `src/types/organization.ts`, `module.ts`, `permissions.ts`, `dashboard.ts`
- Seed data for `modules` and `permissions`
- The Organization Creation Wizard UI (Milestone 2)
- Per-business-type default module lists (Milestone 3) — the schema supports it (`default_for_business_types`) but the actual mapping is product decision, not architecture
