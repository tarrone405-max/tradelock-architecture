// Permission catalog — mirrors the `permissions` table seed in
// supabase/migrations/20260817120000_add_organizations.sql exactly. If you
// add/remove/rename a permission, update both places; there is no single
// runtime source of truth between a one-time SQL seed and the app's static
// type, so they're kept in sync by convention, not by code sharing them.

export type PermissionKey =
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  | "clients.delete"
  | "billing.manage"
  | "payments.approve"
  | "payments.refund"
  | "reports.view"
  | "inventory.manage"
  | "users.invite"
  | "modules.install"
  | "organization.manage";

// `type`, not `interface` — see the comment at the top of
// src/types/organization.ts for why (a real supabase-js .insert() typing
// interaction, not a style choice).
export type Permission = {
  key: PermissionKey;
  label: string;
  module: string;
  description: string;
};

export const PERMISSIONS: Permission[] = [
  { key: "projects.create", label: "Can Create Projects", module: "core", description: "Create new projects" },
  { key: "projects.edit", label: "Can Edit Projects", module: "core", description: "Edit existing projects" },
  { key: "projects.delete", label: "Can Delete Projects", module: "core", description: "Delete projects" },
  { key: "clients.delete", label: "Can Delete Clients", module: "core", description: "Delete client records" },
  { key: "billing.manage", label: "Can Manage Billing", module: "core", description: "Manage subscription and payment settings" },
  { key: "payments.approve", label: "Can Approve Payments", module: "core", description: "Approve offline/manual payments" },
  { key: "payments.refund", label: "Can Issue Refunds", module: "core", description: "Issue refunds on paid change orders" },
  { key: "reports.view", label: "Can View Reports", module: "core", description: "View financial and activity reports" },
  { key: "inventory.manage", label: "Can Manage Inventory", module: "core", description: "Manage inventory records" },
  { key: "users.invite", label: "Can Invite Users", module: "core", description: "Invite new members to the organization" },
  { key: "modules.install", label: "Can Install Modules", module: "core", description: "Install or remove modules" },
  { key: "organization.manage", label: "Can Manage Organization", module: "core", description: "Edit organization-level settings" },
];

export type RolePermission = {
  role_id: string;
  permission_key: PermissionKey;
};

/** Default permission sets for the five seeded system roles (Sprint 1 — see
 * the migration's backfill block for the SQL-side equivalent). Used by
 * `createOrganization` in src/core/organizations/service.ts so a
 * newly-created organization gets the same role/permission shape the
 * backfill gave existing organizations. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  Owner: PERMISSIONS.map((p) => p.key),
  Manager: [
    "projects.create",
    "projects.edit",
    "projects.delete",
    "clients.delete",
    "payments.approve",
    "reports.view",
    "inventory.manage",
    "users.invite",
  ],
  Employee: ["projects.create", "projects.edit", "reports.view"],
  Bookkeeper: ["billing.manage", "payments.approve", "payments.refund", "reports.view"],
  Sales: ["projects.create", "reports.view"],
};
