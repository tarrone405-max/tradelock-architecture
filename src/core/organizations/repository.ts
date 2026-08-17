import "server-only";
import type {
  Organization,
  OrganizationMember,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationWithMembership,
  BusinessType,
  SubscriptionTier,
} from "@/src/types/organization";
import type { PermissionKey } from "@/src/types/permissions";
import type { ModuleSlug } from "@/src/types/module";
import { type OrgClient, asOrgClient } from "./database.types";

export type { OrgClient };
export { asOrgClient };

// ============================================================
// organizations
// ============================================================

export async function getOrganizationById(
  client: OrgClient,
  organizationId: string
): Promise<Organization | null> {
  const { data, error } = await client
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load organization: ${error.message}`);
  }

  return data;
}

export async function getOrganizationBySlug(
  client: OrgClient,
  slug: string
): Promise<Organization | null> {
  const { data, error } = await client
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load organization: ${error.message}`);
  }

  return data;
}

export async function insertOrganization(
  client: OrgClient,
  input: {
    name: string;
    slug: string;
    businessType: BusinessType;
    ownerId: string;
    country?: string;
    timezone?: string;
    stripeCustomerId?: string | null;
    subscriptionStatus?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionTier?: SubscriptionTier;
    trialEndsAt?: string | null;
    stripeAccountId?: string | null;
    stripeConnectChargesEnabled?: boolean;
    stripeConnectPayoutsEnabled?: boolean;
  }
): Promise<Organization> {
  const { data, error } = await client
    .from("organizations")
    .insert({
      name: input.name,
      slug: input.slug,
      business_type: input.businessType,
      owner_id: input.ownerId,
      country: input.country,
      timezone: input.timezone,
      stripe_customer_id: input.stripeCustomerId ?? null,
      subscription_status: input.subscriptionStatus ?? "inactive",
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      subscription_tier: input.subscriptionTier ?? "free",
      trial_ends_at: input.trialEndsAt ?? null,
      stripe_account_id: input.stripeAccountId ?? null,
      stripe_connect_charges_enabled: input.stripeConnectChargesEnabled ?? false,
      stripe_connect_payouts_enabled: input.stripeConnectPayoutsEnabled ?? false,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not create organization: ${error.message}`);
  }

  return data;
}

// ============================================================
// organization_roles / role_permissions
// ============================================================

export async function insertOrganizationRole(
  client: OrgClient,
  organizationId: string,
  name: string,
  isSystemRole: boolean
): Promise<OrganizationRole> {
  const { data, error } = await client
    .from("organization_roles")
    .insert({ organization_id: organizationId, name, is_system_role: isSystemRole })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not create organization role "${name}": ${error.message}`);
  }

  return data;
}

export async function insertRolePermissions(
  client: OrgClient,
  roleId: string,
  permissionKeys: PermissionKey[]
): Promise<void> {
  if (permissionKeys.length === 0) return;

  const { error } = await client
    .from("role_permissions")
    .insert(permissionKeys.map((permission_key) => ({ role_id: roleId, permission_key })));

  if (error) {
    throw new Error(`Could not assign permissions to role: ${error.message}`);
  }
}

// ============================================================
// organization_members
// ============================================================

export async function insertOrganizationMember(
  client: OrgClient,
  organizationId: string,
  userId: string,
  roleId: string,
  status: OrganizationMemberStatus = "active"
): Promise<OrganizationMember> {
  const { data, error } = await client
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role_id: roleId,
      status,
      joined_at: status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not add organization member: ${error.message}`);
  }

  return data;
}

export async function getMembership(
  client: OrgClient,
  organizationId: string,
  userId: string
): Promise<OrganizationMember | null> {
  const { data, error } = await client
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load organization membership: ${error.message}`);
  }

  return data;
}

/** Every organization a user actively belongs to, with their role name in
 * each — used for the org switcher (Milestone 10) and the default-org
 * fallback in src/core/organizations/current.ts. */
export async function listOrganizationsForUser(
  client: OrgClient,
  userId: string
): Promise<OrganizationWithMembership[]> {
  const { data, error } = await client
    .from("organization_members")
    .select("*, organizations(*), organization_roles(name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load organizations for user: ${error.message}`);
  }

  type JoinedRow = OrganizationMember & {
    organizations: Organization | null;
    organization_roles: { name: string } | null;
  };

  return ((data ?? []) as unknown as JoinedRow[])
    .filter((row): row is JoinedRow & { organizations: Organization } => row.organizations !== null)
    .map((row) => ({
      organization: row.organizations,
      membership: row,
      roleName: row.organization_roles?.name ?? "Member",
    }));
}

// ============================================================
// organization_settings
// ============================================================

export async function insertOrganizationSettings(
  client: OrgClient,
  organizationId: string
): Promise<void> {
  const { error } = await client
    .from("organization_settings")
    .insert({ organization_id: organizationId });

  if (error) {
    throw new Error(`Could not initialize organization settings: ${error.message}`);
  }
}

// ============================================================
// organization_modules
// ============================================================

export async function insertOrganizationModules(
  client: OrgClient,
  organizationId: string,
  moduleSlugs: ModuleSlug[]
): Promise<void> {
  if (moduleSlugs.length === 0) return;

  const { error } = await client.from("organization_modules").insert(
    moduleSlugs.map((module_slug) => ({
      organization_id: organizationId,
      module_slug,
      status: "enabled" as const,
    }))
  );

  if (error) {
    throw new Error(`Could not install default modules: ${error.message}`);
  }
}
