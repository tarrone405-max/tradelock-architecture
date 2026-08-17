// Organization domain types.
//
// Hand-authored rather than pulled from types/supabase.ts: that file is
// machine-generated from the live database via a one-off Supabase access
// token (see AGENTS.md), which this environment doesn't have. These types
// describe the schema exactly as written in
// supabase/migrations/20260817120000_add_organizations.sql — once that
// migration is applied and types/supabase.ts is regenerated, these can be
// re-derived from `Database["public"]["Tables"][...]` instead, but until
// then this is the single source of truth for the shape of these tables.

export type BusinessType =
  | "contractor"
  | "restaurant"
  | "photography"
  | "salon"
  | "cleaning"
  | "hvac"
  | "real_estate"
  | "gym"
  | "event_planner"
  | "retail"
  | "medical"
  | "law_firm"
  | "consulting"
  | "manufacturing"
  | "other";

export const BUSINESS_TYPES: BusinessType[] = [
  "contractor",
  "restaurant",
  "photography",
  "salon",
  "cleaning",
  "hvac",
  "real_estate",
  "gym",
  "event_planner",
  "retail",
  "medical",
  "law_firm",
  "consulting",
  "manufacturing",
  "other",
];

export type SubscriptionTier = "free" | "pro" | "business";

// `type`, not `interface`, throughout this file — deliberately. These
// shapes are used as `Row` types in src/core/organizations/database.types.ts
// to augment the generated Supabase Database type, and supabase-js's
// `.insert()`/`.update()` generic resolution silently collapses to
// `never[]` when an interface (rather than a structurally-equivalent type
// alias) appears there — a real, isolated TS/supabase-js interaction, not
// a style preference. Keep every domain type here as `type`.

export type Organization = {
  id: string;
  name: string;
  slug: string;
  business_type: BusinessType;
  logo_url: string | null;
  brand_color: string | null;
  country: string;
  timezone: string;
  owner_id: string;

  // Copied from `users` at backfill time — not yet the source of truth for
  // any live billing/Connect code path. See the migration header comment.
  stripe_customer_id: string | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  subscription_tier: SubscriptionTier;
  trial_ends_at: string | null;
  stripe_account_id: string | null;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;

  created_at: string;
};

export type OrganizationMemberStatus = "invited" | "active" | "suspended";

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string | null;
  role_id: string;
  status: OrganizationMemberStatus;
  invited_email: string | null;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
};

export type OrganizationRole = {
  id: string;
  organization_id: string;
  name: string;
  is_system_role: boolean;
  created_at: string;
};

export type OrganizationSettings = {
  organization_id: string;
  settings: Record<string, unknown>;
  updated_at: string;
};

/** The five system roles seeded for every organization at creation. */
export const SYSTEM_ROLE_NAMES = [
  "Owner",
  "Manager",
  "Employee",
  "Bookkeeper",
  "Sales",
] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];

/** What the create-organization wizard (Milestone 2) will eventually submit. */
export type CreateOrganizationInput = {
  name: string;
  businessType: BusinessType;
  country?: string;
  timezone?: string;
};

/** An organization alongside the caller's own membership/role in it. */
export type OrganizationWithMembership = {
  organization: Organization;
  membership: OrganizationMember;
  roleName: string;
};
