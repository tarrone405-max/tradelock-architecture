"use client";

import { createContext, useContext } from "react";
import type { Organization } from "@/src/types/organization";

const OrganizationContext = createContext<Organization | null | undefined>(undefined);

/**
 * Makes the active organization available to Client Components without
 * prop-drilling or a redundant client-side fetch. The value is resolved
 * server-side once (via getCurrentOrganization in current.ts) and passed
 * in here — this provider never fetches on its own.
 *
 * No switching/refresh logic yet: there's no org-switcher UI built this
 * sprint (Milestone 10), so this is deliberately read-only for now. When
 * that UI exists, switching should still go through the
 * switchOrganizationAction Server Action (it's the only thing allowed to
 * write the active-org cookie) followed by a route refresh, not a
 * client-side state mutation here.
 */
export function OrganizationProvider({
  organization,
  children,
}: {
  organization: Organization | null;
  children: React.ReactNode;
}) {
  return <OrganizationContext.Provider value={organization}>{children}</OrganizationContext.Provider>;
}

/** Throws if used outside an OrganizationProvider — a missing provider is a
 * programming error, not a valid "no organization" state (that's
 * represented by the provider being given `null`, not by omitting it). */
export function useOrganization(): Organization | null {
  const value = useContext(OrganizationContext);

  if (value === undefined) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }

  return value;
}
