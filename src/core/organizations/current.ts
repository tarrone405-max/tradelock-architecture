import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/src/types/organization";
import { switchOrganization, listOrganizationsForUser } from "./service";

/** Holds the user's last-switched-to organization id. Only ever written by
 * the switchOrganization Server Action (see actions.ts) — Next.js only
 * allows setting cookies from a Server Action or Route Handler, not from a
 * Server Component render, so nothing here attempts to write it. When the
 * cookie is missing or points at an organization the user is no longer a
 * member of, resolution falls back to their first organization instead —
 * see getCurrentOrganizationId below. */
export const ACTIVE_ORG_COOKIE = "tl_active_org";

/**
 * Resolves the current request's active organization id: the cookie if
 * it's set and still valid for this user, otherwise their first active
 * membership (stable — listOrganizationsForUser orders by joined_at).
 * Safe to call from a Server Component, Server Action, or Route Handler —
 * it only reads the cookie, never writes it.
 *
 * Returns null if the user isn't signed in or has no organization at all
 * (the latter shouldn't happen once app/(dashboard)/layout.tsx's
 * ensureDefaultOrganization safety net has run for this user).
 */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const organization = await getCurrentOrganization();
  return organization?.id ?? null;
}

export async function getCurrentOrganization(): Promise<Organization | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (cookieOrgId) {
    const result = await switchOrganization(user.id, cookieOrgId);
    if (result.ok) {
      return result.organization;
    }
    // Cookie pointed at an organization the user no longer belongs to
    // (switched accounts, was removed, etc.) — fall through to the default
    // below rather than erroring the whole page over a stale cookie.
  }

  const memberships = await listOrganizationsForUser(user.id);
  return memberships[0]?.organization ?? null;
}

/** Same as getCurrentOrganization, but redirects to the dashboard root
 * instead of returning null — for pages that can't render meaningfully
 * without an organization in scope. Not used by the dashboard layout
 * itself, since that's exactly where the default-organization safety net
 * runs; intended for narrower pages/routes added later that assume an
 * organization already exists by the time they render. */
export async function requireCurrentOrganization(): Promise<Organization> {
  const organization = await getCurrentOrganization();

  if (!organization) {
    redirect("/dashboard");
  }

  return organization;
}
