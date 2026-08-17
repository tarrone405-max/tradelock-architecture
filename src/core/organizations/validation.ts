// Plain hand-rolled validation, matching the rest of this codebase's
// convention (no validation library is installed — see package.json — every
// existing Server Action validates form input with plain if-checks).

import { BUSINESS_TYPES, type BusinessType, type CreateOrganizationInput } from "@/src/types/organization";

const NAME_MAX_LENGTH = 120;
const SLUG_MAX_LENGTH = 60;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isBusinessType(value: string | null | undefined): value is BusinessType {
  return !!value && (BUSINESS_TYPES as string[]).includes(value);
}

export function validateCreateOrganizationInput(input: {
  name: string;
  businessType: string;
  country?: string;
  timezone?: string;
}): ValidationResult<CreateOrganizationInput> {
  const name = input.name.trim();

  if (!name) {
    return { ok: false, error: "Organization name is required." };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Organization name must be ${NAME_MAX_LENGTH} characters or fewer.` };
  }

  if (!isBusinessType(input.businessType)) {
    return { ok: false, error: "Please select a valid business type." };
  }

  return {
    ok: true,
    value: {
      name,
      businessType: input.businessType,
      country: input.country?.trim() || undefined,
      timezone: input.timezone?.trim() || undefined,
    },
  };
}

/** Turns an organization name into a URL-safe, unique-ish slug. Uniqueness
 * itself is enforced by the database's unique constraint — callers should
 * be ready to retry with the `attempt` suffix on a conflict (see
 * `service.createOrganization`), not rely on this function alone. */
export function slugify(name: string, attempt = 0): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);

  const safeBase = base || "organization";
  return attempt === 0 ? safeBase : `${safeBase}-${attempt}`;
}
