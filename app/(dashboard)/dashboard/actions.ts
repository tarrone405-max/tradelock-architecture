"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const OFFLINE_METHODS = ["cash", "check", "financed"] as const;

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null;
  const propertyAddress = String(formData.get("propertyAddress") ?? "").trim() || null;

  if (!clientName) {
    throw new Error("Client name is required.");
  }

  const { error } = await supabase.from("projects").insert({
    user_id: user.id,
    client_name: clientName,
    client_email: clientEmail,
    property_address: propertyAddress,
  });

  if (error) {
    throw new Error(`Could not create project: ${error.message}`);
  }

  revalidatePath("/dashboard");
}

export async function createChangeOrder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const cost = Number(formData.get("cost"));
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;

  if (!projectId || !description || !Number.isFinite(cost) || cost < 0) {
    throw new Error("A description and a valid non-negative cost are required.");
  }

  // Providers can only insert change orders on projects they own — enforced
  // by the Phase 2 RLS policy, not just this check.
  const { error } = await supabase.from("change_orders").insert({
    project_id: projectId,
    description,
    cost,
    due_date: dueDate,
  });

  if (error) {
    throw new Error(`Could not create change order: ${error.message}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
}

// Records a cash/check/financed payment the contractor collected outside
// Stripe. Uses the service-role client rather than the session-aware one —
// ownership is verified here in code (two plain lookups) instead of via
// RLS, matching how billing (Phase 3) and the client portal (Phase 5)
// already do trusted writes in this app.
export async function recordOfflinePayment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const method = String(formData.get("method") ?? "");
  const reference = String(formData.get("reference") ?? "").trim() || null;

  if (!(OFFLINE_METHODS as readonly string[]).includes(method)) {
    throw new Error("Invalid payment method.");
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: changeOrder } = await supabaseAdmin
    .from("change_orders")
    .select("id, project_id, status, client_signed_at, provider_signed_at")
    .eq("id", changeOrderId)
    .maybeSingle();

  if (!changeOrder) {
    throw new Error("Change order not found.");
  }

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", changeOrder.project_id)
    .maybeSingle();

  if (!project || project.user_id !== user.id) {
    throw new Error("You don't have access to this change order.");
  }

  if (["paid", "cash", "check", "financed"].includes(changeOrder.status)) {
    throw new Error("This change order has already been settled.");
  }

  if (changeOrder.status === "declined") {
    throw new Error("This change order was declined and can't be marked paid.");
  }

  // Settlement rule: offline payment (cash/check/financed) can only be
  // recorded once BOTH the client's signature and the provider's
  // countersignature are in — same requirement as online payment. A
  // pending (unsigned) or client-signed-only order is not eligible yet.
  if (
    changeOrder.status !== "approved" ||
    !changeOrder.client_signed_at ||
    !changeOrder.provider_signed_at
  ) {
    throw new Error(
      "Both the client's signature and your countersignature are required before you can record payment."
    );
  }

  const { error } = await supabaseAdmin
    .from("change_orders")
    .update({ status: method, payment_reference: reference })
    .eq("id", changeOrderId)
    .eq("status", "approved");

  if (error) {
    throw new Error(`Could not record payment: ${error.message}`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/projects/${changeOrder.project_id}`);
}

// The provider's half of the dual-signature flow: the client signs first
// via the portal (sets client_signed_at), then the provider countersigns
// here once that's in. Same service-role + explicit ownership check
// pattern as recordOfflinePayment above — this sets legally-significant
// execution state, not simple own-row CRUD.
export async function countersignChangeOrder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const providerName = String(formData.get("providerName") ?? "").trim();

  if (!providerName) {
    throw new Error("Your name is required to countersign.");
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: changeOrder } = await supabaseAdmin
    .from("change_orders")
    .select("id, project_id, client_signed_at, provider_signed_at")
    .eq("id", changeOrderId)
    .maybeSingle();

  if (!changeOrder) {
    throw new Error("Change order not found.");
  }

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", changeOrder.project_id)
    .maybeSingle();

  if (!project || project.user_id !== user.id) {
    throw new Error("You don't have access to this change order.");
  }

  if (!changeOrder.client_signed_at) {
    throw new Error("The client hasn't signed this change order yet.");
  }

  if (changeOrder.provider_signed_at) {
    throw new Error("This change order has already been countersigned.");
  }

  const { error } = await supabaseAdmin
    .from("change_orders")
    .update({
      provider_signed_at: new Date().toISOString(),
      provider_signature_name: providerName,
    })
    .eq("id", changeOrderId);

  if (error) {
    throw new Error(`Could not countersign: ${error.message}`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/projects/${changeOrder.project_id}`);
}

// Kills client access via the project's current portal link without
// issuing a replacement — e.g. the project is done/cancelled and the
// provider wants the old link dead. RLS already scopes `projects` UPDATE to
// rows the caller owns, same trust model createProject already relies on.
export async function revokePortalLink(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Missing project.");
  }

  const { error } = await supabase
    .from("projects")
    .update({ portal_token_revoked_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Could not revoke portal link: ${error.message}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
}

// Issues a fresh unique_token, immediately invalidating the old portal URL
// and reactivating access (clears any prior revocation) under a new one —
// how a provider recovers from a leaked/accidentally-shared link, not just
// a deliberately revoked one.
export async function rotatePortalLink(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Missing project.");
  }

  const { error } = await supabase
    .from("projects")
    .update({ unique_token: randomUUID(), portal_token_revoked_at: null })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Could not rotate portal link: ${error.message}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
}
