"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrganization as createOrganizationService, switchOrganization as switchOrganizationService } from "./service";
import { ACTIVE_ORG_COOKIE } from "./current";

// Same shape as every other Server Action in this codebase (see
// app/actions/connect.ts, app/(dashboard)/dashboard/actions.ts) — return an
// error instead of throwing, since a thrown Error from an action bound to a
// <form action={...}> has no error boundary in Next.js and takes down the
// whole page instead of showing an inline message.
export type OrganizationActionState = { error: string | null };

export async function createOrganizationAction(
  _prevState: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create an organization." };
  }

  const name = String(formData.get("name") ?? "");
  const businessType = String(formData.get("businessType") ?? "");
  const country = formData.get("country") ? String(formData.get("country")) : undefined;
  const timezone = formData.get("timezone") ? String(formData.get("timezone")) : undefined;

  const result = await createOrganizationService(user.id, { name, businessType, country, timezone });

  if (!result.ok) {
    return { error: result.error };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, result.organization.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/dashboard");
  return { error: null };
}

export async function switchOrganizationAction(
  _prevState: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const organizationId = String(formData.get("organizationId") ?? "");

  if (!organizationId) {
    return { error: "No organization selected." };
  }

  const result = await switchOrganizationService(user.id, organizationId);

  if (!result.ok) {
    return { error: result.error };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, result.organization.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/dashboard");
  return { error: null };
}
