import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Organization, OrganizationWithMembership, BusinessType } from "@/src/types/organization";
import { SYSTEM_ROLE_NAMES } from "@/src/types/organization";
import { DEFAULT_ROLE_PERMISSIONS } from "@/src/types/permissions";
import { CORE_MODULE_SLUGS } from "@/src/types/module";
import { validateCreateOrganizationInput, slugify } from "./validation";
import {
  asOrgClient,
  getOrganizationBySlug,
  insertOrganization,
  insertOrganizationRole,
  insertRolePermissions,
  insertOrganizationMember,
  insertOrganizationSettings,
  insertOrganizationModules,
  getMembership,
  getOrganizationById,
  listOrganizationsForUser as repoListOrganizationsForUser,
} from "./repository";

export type CreateOrganizationResult =
  | { ok: true; organization: Organization }
  | { ok: false; error: string };

const SLUG_MAX_ATTEMPTS = 5;

/**
 * Creates an organization end-to-end: the org row itself, the five system
 * roles with their default permission grants, the creator's Owner
 * membership, an empty settings row, and the core modules enabled by
 * default. Runs on the admin (service-role) client throughout — only
 * `organizations` itself has an authenticated-insert RLS policy, every
 * sub-table here is service-role-only (see the migration's RLS section),
 * so a single client for the whole operation keeps this one coherent unit
 * of work instead of switching clients mid-flow.
 *
 * Not wrapped in a database transaction — the Supabase JS client has no
 * multi-statement transaction primitive over PostgREST, and this codebase
 * has no precedent for a `security definer` RPC function to get one (see
 * app/actions/auth.ts's signUp for the same accepted risk: auth user
 * created, then a separate insert that can independently fail). A
 * genuinely atomic version of this would need exactly that kind of RPC —
 * flagged as a Sprint 2 hardening candidate, not built here.
 */
export async function createOrganization(
  ownerId: string,
  input: { name: string; businessType: string; country?: string; timezone?: string }
): Promise<CreateOrganizationResult> {
  const validated = validateCreateOrganizationInput(input);

  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const admin = asOrgClient(getSupabaseAdmin());

  let slug = slugify(validated.value.name);
  for (let attempt = 1; attempt <= SLUG_MAX_ATTEMPTS; attempt++) {
    const existing = await getOrganizationBySlug(admin, slug);
    if (!existing) break;
    slug = slugify(validated.value.name, attempt);
    if (attempt === SLUG_MAX_ATTEMPTS) {
      return { ok: false, error: "Could not generate a unique organization identifier. Try a different name." };
    }
  }

  let organization: Organization;
  try {
    organization = await insertOrganization(admin, {
      name: validated.value.name,
      slug,
      businessType: validated.value.businessType as BusinessType,
      ownerId,
      country: validated.value.country,
      timezone: validated.value.timezone,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create organization." };
  }

  try {
    const roleIdsByName = new Map<string, string>();

    for (const roleName of SYSTEM_ROLE_NAMES) {
      const role = await insertOrganizationRole(admin, organization.id, roleName, roleName === "Owner");
      roleIdsByName.set(roleName, role.id);

      const permissions = DEFAULT_ROLE_PERMISSIONS[roleName] ?? [];
      await insertRolePermissions(admin, role.id, permissions);
    }

    const ownerRoleId = roleIdsByName.get("Owner");
    if (!ownerRoleId) {
      throw new Error("Owner role was not created.");
    }

    await insertOrganizationMember(admin, organization.id, ownerId, ownerRoleId, "active");
    await insertOrganizationSettings(admin, organization.id);
    await insertOrganizationModules(admin, organization.id, CORE_MODULE_SLUGS);
  } catch (error) {
    // The organization row itself was created successfully; only the
    // follow-on setup failed partway. Surfacing this as an error (rather
    // than silently swallowing it) is deliberate — an organization with no
    // Owner membership is unusable, and the caller needs to know that
    // rather than believe creation fully succeeded.
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Organization created, but setup failed: ${error.message}`
          : "Organization created, but setup failed.",
    };
  }

  return { ok: true, organization };
}

/**
 * Self-heal for any user with zero organizations — the migration's backfill
 * only covers users that existed when it ran; anyone who signs up after
 * that (and before Milestone 2's creation wizard replaces this entirely)
 * would otherwise have nowhere for their projects to live. Mirrors the
 * existing "profile safety net" pattern in app/(dashboard)/layout.tsx: a
 * cheap existence check, and an insert only if nothing was found — safe to
 * call on every dashboard request.
 */
export async function ensureDefaultOrganization(
  userId: string,
  defaultName?: string | null
): Promise<Organization | null> {
  const admin = asOrgClient(getSupabaseAdmin());
  const existing = await repoListOrganizationsForUser(admin, userId);

  if (existing.length > 0) {
    return existing[0].organization;
  }

  const result = await createOrganization(userId, {
    name: defaultName?.trim() || "My Business",
    businessType: "contractor",
  });

  if (!result.ok) {
    console.error("ensureDefaultOrganization failed:", result.error);
    return null;
  }

  return result.organization;
}

export type SwitchOrganizationResult =
  | { ok: true; organization: Organization }
  | { ok: false; error: string };

/** Verifies the user is an active member before allowing a switch — never
 * trust an organization id from a cookie or form field without this. */
export async function switchOrganization(
  userId: string,
  organizationId: string
): Promise<SwitchOrganizationResult> {
  const admin = asOrgClient(getSupabaseAdmin());
  const membership = await getMembership(admin, organizationId, userId);

  if (!membership) {
    return { ok: false, error: "You're not a member of that organization." };
  }

  const organization = await getOrganizationById(admin, organizationId);

  if (!organization) {
    return { ok: false, error: "That organization no longer exists." };
  }

  return { ok: true, organization };
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationWithMembership[]> {
  const admin = asOrgClient(getSupabaseAdmin());
  return repoListOrganizationsForUser(admin, userId);
}
