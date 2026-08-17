// Module catalog types — mirrors the `modules` table seed in
// supabase/migrations/20260817120000_add_organizations.sql. `core` (the
// src/modules/core registry folder) is deliberately not a catalog row here:
// it's the module *system* itself, not an installable business module.

import type { BusinessType } from "./organization";

export type ModuleSlug =
  | "projects"
  | "billing"
  | "messaging"
  | "clients"
  | "crm"
  | "calendar"
  | "events"
  | "automation"
  | "templates"
  | "inventory"
  | "ai";

// `type`, not `interface` — see the comment at the top of
// src/types/organization.ts for why (a real supabase-js .insert() typing
// interaction, not a style choice).
export type ModuleDefinition = {
  slug: ModuleSlug;
  name: string;
  description: string;
  icon: string | null;
  /** Always enabled, never shown in the marketplace as optional. */
  is_core: boolean;
  default_for_business_types: BusinessType[];
  created_at: string;
};

export type OrganizationModuleStatus = "enabled" | "disabled" | "trial";

export type OrganizationModule = {
  id: string;
  organization_id: string;
  module_slug: ModuleSlug;
  status: OrganizationModuleStatus;
  installed_at: string;
  trial_ends_at: string | null;
  installed_by: string | null;
  config: Record<string, unknown>;
};

/** Modules enabled by default on every new organization, regardless of
 * business type — matches `is_core = true` in the migration seed. */
export const CORE_MODULE_SLUGS: ModuleSlug[] = ["projects", "billing", "messaging"];
