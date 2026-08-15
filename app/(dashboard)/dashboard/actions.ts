"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { getUserPlan } from "@/lib/planAccess";
import { sendEmail } from "@/lib/resend";
import { notifyFeedbackReceived } from "@/lib/notifyFeedback";
import NotificationEmail from "@/emails/NotificationEmail";
import type { FeedbackActionState } from "@/components/FeedbackForm";


const OFFLINE_METHODS = ["cash", "check", "financed"] as const;
const FEEDBACK_TYPES = ["bug", "suggestion"] as const;

// Shared shape for Server Actions driven by useActionState — these return an
// error instead of throwing, since a thrown Error from an action bound
// directly to a <form action={...}> has no error boundary in Next.js and
// takes down the whole route instead of showing an inline message.
export type FormActionState = { error: string | null };

export async function createProject(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const plan = await getUserPlan(user.id);

  if (!plan.features.unlimitedProjects) {
    const { count, error: countError } = await getSupabaseAdmin()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      return { error: `Could not check project limit: ${countError.message}` };
    }

    if ((count ?? 0) >= 5) {
      return {
        error:
          "You've reached the 5-project limit on the Free plan. Upgrade to Pro for unlimited projects.",
      };
    }
  }

  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null;
  const propertyAddress = String(formData.get("propertyAddress") ?? "").trim() || null;

  if (!clientName) {
    return { error: "Client name is required." };
  }

  const { error } = await supabase.from("projects").insert({
    user_id: user.id,
    client_name: clientName,
    client_email: clientEmail,
    property_address: propertyAddress,
  });

  if (error) {
    return { error: `Could not create project: ${error.message}` };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function createChangeOrder(
  _prevState: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const plan = await getUserPlan(user.id);

  if (!plan.features.unlimitedChangeOrders) {
    const { count, error: countError } = await getSupabaseAdmin()
      .from("change_orders")
      .select("id, project_id, projects!inner(user_id)", { count: "exact", head: true })
      .eq("projects.user_id", user.id);

    if (countError) {
      return { error: `Could not check change order limit: ${countError.message}` };
    }

    if ((count ?? 0) >= 20) {
      return {
        error:
          "You've reached the 20 change-order limit on the Free plan. Upgrade to Pro for unlimited change orders.",
      };
    }
  }

  const projectId = String(formData.get("projectId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const cost = Number(formData.get("cost"));
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;

  if (!projectId || !description || !Number.isFinite(cost) || cost < 0) {
    return { error: "A description and a valid non-negative cost are required." };
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
    return { error: `Could not create change order: ${error.message}` };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { error: null };
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
    .update({ status: method, payment_reference: reference, paid_at: new Date().toISOString() })
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

// Refunds a Stripe-paid change order (full, or partial if `amount` is
// given) from the provider's dashboard. This only calls the Stripe API —
// the resulting state (status, refunded_amount) is recorded by the
// webhook's charge.refunded handler, not written here, matching how every
// other Stripe-mutating action in this app defers to the webhook as the
// single source of truth for what actually happened.
export async function refundChangeOrder(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const amountInput = String(formData.get("amount") ?? "").trim();

  const supabaseAdmin = getSupabaseAdmin();

  const { data: changeOrder } = await supabaseAdmin
    .from("change_orders")
    .select("id, project_id, cost, status, stripe_payment_intent_id, refunded_amount")
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

  // Only Stripe-paid change orders go through this action — cash/check/
  // financed payments were never processed through Stripe, so there's
  // nothing here to refund via the API; the provider handles those
  // directly with the client.
  if (changeOrder.status !== "paid" || !changeOrder.stripe_payment_intent_id) {
    throw new Error(
      "Only online (Stripe) payments can be refunded here — cash, check, and financed payments aren't Stripe transactions."
    );
  }

  const costCents = Math.round(Number(changeOrder.cost) * 100);
  const alreadyRefundedCents = changeOrder.refunded_amount ?? 0;
  const remainingCents = costCents - alreadyRefundedCents;

  if (remainingCents <= 0) {
    throw new Error("This change order has already been fully refunded.");
  }

  let refundAmountCents: number | undefined;
  if (amountInput) {
    const requestedDollars = Number(amountInput);
    if (!Number.isFinite(requestedDollars) || requestedDollars <= 0) {
      throw new Error("Enter a valid refund amount.");
    }
    refundAmountCents = Math.round(requestedDollars * 100);
    if (refundAmountCents > remainingCents) {
      throw new Error(
        `You can refund at most $${(remainingCents / 100).toFixed(2)} — the rest has already been refunded.`
      );
    }
  }
  // amountInput left blank -> full remaining refund (Stripe's own default
  // when `amount` is omitted from refunds.create).

  const stripe = getStripe();

  try {
    await stripe.refunds.create({
      payment_intent: changeOrder.stripe_payment_intent_id,
      amount: refundAmountCents,
      // Destination charges don't reverse the connected-account transfer or
      // the application fee by default — without these, TradeLock's own
      // platform balance would eat the entire refund while the provider
      // keeps the money. reverse_transfer pulls the funds back out of the
      // provider's connected account; refund_application_fee gives back
      // TradeLock's cut proportionally rather than keeping a fee on money
      // that was returned to the client.
      reverse_transfer: true,
      refund_application_fee: true,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("Stripe refund failed:", err.message);
      throw new Error(`Could not process refund: ${err.message}`);
    }
    throw err;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/projects/${changeOrder.project_id}`);
}

// Provider's half of project messaging. RLS already scopes the insert to
// projects the caller owns (see 20260810180000_add_messages.sql), same
// trust model createChangeOrder already relies on. Notifying the client by
// email is a side effect, not a precondition — a Resend outage should
// never make sending a message fail.
export async function sendProviderMessage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const projectId = String(formData.get("projectId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!projectId || !body) {
    throw new Error("A message is required.");
  }

  const { error } = await supabase.from("messages").insert({
    project_id: projectId,
    sender_type: "provider",
    body,
  });

  if (error) {
    throw new Error(`Could not send message: ${error.message}`);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("client_name, client_email, unique_token, users(company_name)")
      .eq("id", projectId)
      .maybeSingle();

    if (project?.client_email) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      const companyName = project.users?.company_name || "Your contractor";

      await sendEmail({
        to: project.client_email,
        subject: `New message from ${companyName}`,
        react: NotificationEmail({
          preview: `${companyName} sent you a new message on TradeLock`,
          heading: "You have a new message",
          body: `${companyName} sent you a message about your project. Reply from your client portal.`,
          ctaLabel: "View message",
          ctaUrl: `${siteUrl}/p/${project.unique_token}`,
          footer: `Sent by TradeLock on behalf of ${companyName}.`,
        }),
      });
    }
  } catch (notifyError) {
    console.error("Failed to send new-message notification:", notifyError);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
}

// A provider's half of the bug-report/suggestion channel — see
// app/p/[token]/actions.ts's submitClientFeedback for the client half.
// Addressed to whoever operates TradeLock, not to the provider's own
// clients, so this only ever inserts + notifies; there's nothing to
// revalidate or read back in the dashboard.
export async function submitFeedback(
  _prevState: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in.", success: false };
  }

  const feedbackType = String(formData.get("feedbackType") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;

  if (!(FEEDBACK_TYPES as readonly string[]).includes(feedbackType)) {
    return { error: "Choose whether this is a bug report or a suggestion.", success: false };
  }

  if (!message) {
    return { error: "Please describe the bug or suggestion.", success: false };
  }

  const { error } = await supabase.from("feedback").insert({
    submitted_by: "provider",
    user_id: user.id,
    feedback_type: feedbackType,
    message,
    contact_email: contactEmail,
  });

  if (error) {
    return { error: `Could not send feedback: ${error.message}`, success: false };
  }

  try {
    await notifyFeedbackReceived({
      feedbackType: feedbackType as "bug" | "suggestion",
      message,
      contactEmail,
      from: user.email ?? "a provider",
    });
  } catch (notifyError) {
    console.error("Failed to send feedback notification:", notifyError);
  }

  return { error: null, success: true };
}
