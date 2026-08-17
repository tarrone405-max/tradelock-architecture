import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as GeneratedDatabase } from "@/types/supabase";
import type {
  Organization,
  OrganizationMember,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationSettings,
} from "@/src/types/organization";
import type { PermissionKey } from "@/src/types/permissions";
import type { ModuleSlug, OrganizationModuleStatus } from "@/src/types/module";

// types/supabase.ts is machine-generated from the live database via a
// one-off Supabase access token (see AGENTS.md) — this environment doesn't
// have one, so it can't be regenerated to include the tables/columns added
// by supabase/migrations/20260817120000_add_organizations.sql. This file
// is the single place that augments the generated Database type to match
// that migration exactly; every organizations-related file that needs to
// call `.from(...)` on a new table, or insert `organization_id` into an
// existing one, imports the `Database`/`OrgClient`/`asOrgClient` from here
// rather than re-deriving its own local version. Once the migration is
// applied and types/supabase.ts is regenerated for real, this whole file
// becomes redundant and every import of it can be swapped back to
// `@/types/supabase` directly.
//
// Every Row/Insert/Update below is written as a flat object literal, not
// as `Partial<X> & {...}` or `Generated[...]["Insert"] & {...}`.
// supabase-js's `.insert()`/`.update()` overloads resolve the row shape
// through a conditional type keyed off `Database["public"]["Tables"][Table]`
// — when that resolves to an unflattened intersection type (even one that
// would structurally simplify to the same shape), the conditional
// inference can silently collapse to `never[]` instead of erroring, which
// is exactly what happened here on first pass. Flat literals sidestep it
// entirely. The final `Tables` map below applies the same rule: it's built
// via `Omit<..., overriddenKeys> & { ...flat overrides... }` so no key is
// ever present in both intersection operands.

type OrganizationsTable = {
  Row: Organization;
  Insert: {
    id?: string;
    name: string;
    slug: string;
    business_type: Organization["business_type"];
    logo_url?: string | null;
    brand_color?: string | null;
    country?: string;
    timezone?: string;
    owner_id: string;
    stripe_customer_id?: string | null;
    subscription_status?: string | null;
    stripe_subscription_id?: string | null;
    subscription_tier?: Organization["subscription_tier"];
    trial_ends_at?: string | null;
    stripe_account_id?: string | null;
    stripe_connect_charges_enabled?: boolean;
    stripe_connect_payouts_enabled?: boolean;
    created_at?: string;
  };
  Update: {
    id?: string;
    name?: string;
    slug?: string;
    business_type?: Organization["business_type"];
    logo_url?: string | null;
    brand_color?: string | null;
    country?: string;
    timezone?: string;
    owner_id?: string;
    stripe_customer_id?: string | null;
    subscription_status?: string | null;
    stripe_subscription_id?: string | null;
    subscription_tier?: Organization["subscription_tier"];
    trial_ends_at?: string | null;
    stripe_account_id?: string | null;
    stripe_connect_charges_enabled?: boolean;
    stripe_connect_payouts_enabled?: boolean;
    created_at?: string;
  };
  Relationships: [];
};

type OrganizationMembersTable = {
  Row: OrganizationMember;
  Insert: {
    id?: string;
    organization_id: string;
    user_id?: string | null;
    role_id: string;
    status?: OrganizationMemberStatus;
    invited_email?: string | null;
    invited_by?: string | null;
    joined_at?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    organization_id?: string;
    user_id?: string | null;
    role_id?: string;
    status?: OrganizationMemberStatus;
    invited_email?: string | null;
    invited_by?: string | null;
    joined_at?: string | null;
    created_at?: string;
  };
  Relationships: [];
};

type OrganizationRolesTable = {
  Row: OrganizationRole;
  Insert: {
    id?: string;
    organization_id: string;
    name: string;
    is_system_role?: boolean;
    created_at?: string;
  };
  Update: {
    id?: string;
    organization_id?: string;
    name?: string;
    is_system_role?: boolean;
    created_at?: string;
  };
  Relationships: [];
};

type RolePermissionsTable = {
  Row: { role_id: string; permission_key: PermissionKey };
  Insert: { role_id: string; permission_key: PermissionKey };
  Update: { role_id?: string; permission_key?: PermissionKey };
  Relationships: [];
};

type OrganizationSettingsTable = {
  Row: OrganizationSettings;
  Insert: {
    organization_id: string;
    settings?: Record<string, unknown>;
    updated_at?: string;
  };
  Update: {
    organization_id?: string;
    settings?: Record<string, unknown>;
    updated_at?: string;
  };
  Relationships: [];
};

type OrganizationModulesTable = {
  Row: {
    id: string;
    organization_id: string;
    module_slug: ModuleSlug;
    status: OrganizationModuleStatus;
    installed_at: string;
    trial_ends_at: string | null;
    installed_by: string | null;
    config: Record<string, unknown>;
  };
  Insert: {
    id?: string;
    organization_id: string;
    module_slug: ModuleSlug;
    status?: OrganizationModuleStatus;
    installed_at?: string;
    trial_ends_at?: string | null;
    installed_by?: string | null;
    config?: Record<string, unknown>;
  };
  Update: {
    id?: string;
    organization_id?: string;
    module_slug?: ModuleSlug;
    status?: OrganizationModuleStatus;
    installed_at?: string;
    trial_ends_at?: string | null;
    installed_by?: string | null;
    config?: Record<string, unknown>;
  };
  Relationships: [];
};

// --- existing tables, now organization-scoped -------------------------------
// Field lists copied from the current schema (initial_schema.sql plus every
// migration through 20260810210000_add_feedback.sql, per AGENTS.md) with
// organization_id added — not derived from GeneratedDatabase via `&`, for
// the flattening reason explained above.

type ProjectsTable = {
  Row: {
    id: string;
    user_id: string;
    organization_id: string;
    client_name: string;
    client_email: string | null;
    property_address: string | null;
    unique_token: string;
    portal_token_revoked_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    organization_id: string;
    client_name: string;
    client_email?: string | null;
    property_address?: string | null;
    unique_token?: string;
    portal_token_revoked_at?: string | null;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    organization_id?: string;
    client_name?: string;
    client_email?: string | null;
    property_address?: string | null;
    unique_token?: string;
    portal_token_revoked_at?: string | null;
    created_at?: string;
  };
  Relationships: [];
};

type ChangeOrdersTable = {
  Row: {
    id: string;
    project_id: string;
    organization_id: string;
    description: string;
    cost: number;
    status: string;
    signature_data: string | null;
    signed_at: string | null;
    created_at: string;
    payment_reference: string | null;
    terms_version_id: string | null;
    terms_accepted_at: string | null;
    due_date: string | null;
    provider_signed_at: string | null;
    provider_signature_name: string | null;
    client_signed_at: string | null;
    client_signature_name: string | null;
    stripe_payment_intent_id: string | null;
    stripe_connected_account_id: string | null;
    stripe_checkout_session_id: string | null;
    stripe_charge_id: string | null;
    currency: string | null;
    application_fee_amount: number | null;
    refunded_amount: number | null;
    refunded_at: string | null;
    stripe_refund_id: string | null;
    dispute_status: string | null;
    disputed_at: string | null;
    stripe_dispute_id: string | null;
    paid_at: string | null;
    last_reminder_sent_at: string | null;
  };
  Insert: {
    id?: string;
    project_id: string;
    organization_id: string;
    description: string;
    cost: number;
    status?: string;
    signature_data?: string | null;
    signed_at?: string | null;
    created_at?: string;
    payment_reference?: string | null;
    terms_version_id?: string | null;
    terms_accepted_at?: string | null;
    due_date?: string | null;
    provider_signed_at?: string | null;
    provider_signature_name?: string | null;
    client_signed_at?: string | null;
    client_signature_name?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_connected_account_id?: string | null;
    stripe_checkout_session_id?: string | null;
    stripe_charge_id?: string | null;
    currency?: string | null;
    application_fee_amount?: number | null;
    refunded_amount?: number | null;
    refunded_at?: string | null;
    stripe_refund_id?: string | null;
    dispute_status?: string | null;
    disputed_at?: string | null;
    stripe_dispute_id?: string | null;
    paid_at?: string | null;
    last_reminder_sent_at?: string | null;
  };
  Update: {
    id?: string;
    project_id?: string;
    organization_id?: string;
    description?: string;
    cost?: number;
    status?: string;
    signature_data?: string | null;
    signed_at?: string | null;
    created_at?: string;
    payment_reference?: string | null;
    terms_version_id?: string | null;
    terms_accepted_at?: string | null;
    due_date?: string | null;
    provider_signed_at?: string | null;
    provider_signature_name?: string | null;
    client_signed_at?: string | null;
    client_signature_name?: string | null;
    stripe_payment_intent_id?: string | null;
    stripe_connected_account_id?: string | null;
    stripe_checkout_session_id?: string | null;
    stripe_charge_id?: string | null;
    currency?: string | null;
    application_fee_amount?: number | null;
    refunded_amount?: number | null;
    refunded_at?: string | null;
    stripe_refund_id?: string | null;
    dispute_status?: string | null;
    disputed_at?: string | null;
    stripe_dispute_id?: string | null;
    paid_at?: string | null;
    last_reminder_sent_at?: string | null;
  };
  Relationships: [];
};

type TermsOfServiceTable = {
  Row: {
    id: string;
    user_id: string;
    organization_id: string;
    version: number;
    content: string;
    is_active: boolean;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    organization_id: string;
    version: number;
    content: string;
    is_active?: boolean;
    created_at?: string;
  };
  Update: {
    id?: string;
    user_id?: string;
    organization_id?: string;
    version?: number;
    content?: string;
    is_active?: boolean;
    created_at?: string;
  };
  Relationships: [];
};

type OverriddenTableName = "projects" | "change_orders" | "terms_of_service";

// Built as one flat object literal all the way up — no `&` between two
// operands that share a key (not even at the top level or the `public`
// level), otherwise the exact same never[] collapse described above
// reappears one level higher, which is what happened on the first attempt
// at this file (`GeneratedDatabase & { public: ... }` still intersects
// `public` against `public`, silently re-merging the very Tables map the
// inner Omit was trying to keep flat).
export type Database = {
  __InternalSupabase: GeneratedDatabase["__InternalSupabase"];
  public: {
    Tables: Omit<GeneratedDatabase["public"]["Tables"], OverriddenTableName> & {
      organizations: OrganizationsTable;
      organization_members: OrganizationMembersTable;
      organization_roles: OrganizationRolesTable;
      role_permissions: RolePermissionsTable;
      organization_settings: OrganizationSettingsTable;
      organization_modules: OrganizationModulesTable;
      projects: ProjectsTable;
      change_orders: ChangeOrdersTable;
      terms_of_service: TermsOfServiceTable;
    };
    Views: GeneratedDatabase["public"]["Views"];
    Functions: GeneratedDatabase["public"]["Functions"];
    Enums: GeneratedDatabase["public"]["Enums"];
    CompositeTypes: GeneratedDatabase["public"]["CompositeTypes"];
  };
};

/** Any Supabase client (session or service-role), typed against the
 * augmented Database above. */
export type OrgClient = SupabaseClient<Database>;

/** The single point where a normal `SupabaseClient<Database>` (generated,
 * pre-augmentation) is cast to the augmented type. Everywhere else gets
 * full type-checking on the fields that actually matter — table/column
 * names, insert shapes — this cast is just bridging the gap until
 * types/supabase.ts itself knows about these tables. */
export function asOrgClient(client: SupabaseClient<GeneratedDatabase>): OrgClient {
  return client as unknown as OrgClient;
}
