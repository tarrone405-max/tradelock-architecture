"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, getApplicationFeeAmount } from "@/lib/stripe";
import { sendEmail } from "@/lib/resend";
import ChangeOrderApprovedContractorEmail from "@/emails/ChangeOrderApprovedContractorEmail";
import ChangeOrderReceiptEmail from "@/emails/ChangeOrderReceiptEmail";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Homeowners aren't Supabase Auth users, so the portal has no session/RLS
// path of its own — every action here re-validates the token against the
// database itself (service role, RLS bypassed) before touching a row, per
// CLAUDE.md's "always validate magic-link tokens securely" rule. Every
// mutation is also scoped with .eq("project_id", project.id) so a token can
// only ever touch its own project's change orders.
async function getProjectByToken(token: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, user_id, client_name, client_email, unique_token")
    .eq("unique_token", token)
    // A revoked or rotated-away token must behave exactly like an invalid
    // one for every mutation in this file — see
    // app/(dashboard)/dashboard/actions.ts's revokePortalLink/rotatePortalLink.
    .is("portal_token_revoked_at", null)
    .maybeSingle();
  return project;
}

export async function signChangeOrder(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const signatureData = String(formData.get("signatureData") ?? "");
  const signatureName = String(formData.get("signatureName") ?? "").trim();
  const termsVersionId = String(formData.get("termsVersionId") ?? "") || null;
  const termsAccepted = formData.get("termsAccepted") === "on";

  if (!signatureData.startsWith("data:image/")) {
    throw new Error("A signature is required.");
  }

  if (!signatureName) {
    throw new Error("Your full legal name is required to sign.");
  }

  const project = await getProjectByToken(token);
  if (!project) {
    throw new Error("Invalid or expired portal link.");
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Re-check server-side whether this provider currently has an active ToS
  // — the client-side `disabled` attribute on the submit button isn't a
  // security boundary, someone could submit the form directly. If one is
  // active, agreement (matching that exact version) is mandatory.
  const { data: activeTerms } = await supabaseAdmin
    .from("terms_of_service")
    .select("id")
    .eq("user_id", project.user_id)
    .eq("is_active", true)
    .maybeSingle();

  if (activeTerms && (!termsAccepted || termsVersionId !== activeTerms.id)) {
    throw new Error("You must agree to the current Terms of Service to sign.");
  }

  const now = new Date().toISOString();
  const { data: updatedOrder, error } = await supabaseAdmin
    .from("change_orders")
    .update({
      signature_data: signatureData,
      status: "approved",
      signed_at: now,
      client_signed_at: now,
      client_signature_name: signatureName,
      terms_version_id: activeTerms ? activeTerms.id : null,
      terms_accepted_at: activeTerms ? now : null,
    })
    .eq("id", changeOrderId)
    .eq("project_id", project.id)
    .eq("status", "pending")
    .select("description, cost, due_date")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not save signature: ${error.message}`);
  }

  // Notifications are a side effect of a successful sign, not part of the
  // transaction — a Resend outage should never make an approval fail.
  if (updatedOrder) {
    try {
      await notifyChangeOrderApproved({ project, order: updatedOrder });
    } catch (notifyError) {
      console.error("Failed to send change order approval emails:", notifyError);
    }
  }

  revalidatePath(`/p/${token}`);
}

async function notifyChangeOrderApproved({
  project,
  order,
}: {
  project: { id: string; user_id: string; client_name: string; client_email: string | null; unique_token: string };
  order: { description: string; cost: number; due_date: string | null };
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: provider } = await supabaseAdmin
    .from("users")
    .select("email, company_name")
    .eq("id", project.user_id)
    .maybeSingle();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const cost = currency.format(Number(order.cost));
  const companyName = provider?.company_name || "Your contractor";
  const dueDate = order.due_date
    ? new Date(order.due_date + "T00:00:00").toLocaleDateString()
    : null;

  if (provider?.email) {
    await sendEmail({
      to: provider.email,
      subject: `Change order approved by ${project.client_name}`,
      react: ChangeOrderApprovedContractorEmail({
        clientName: project.client_name,
        description: order.description,
        cost,
        projectUrl: `${siteUrl}/dashboard/projects/${project.id}`,
      }),
    });
  }

  if (project.client_email) {
    await sendEmail({
      to: project.client_email,
      subject: `You approved a change order with ${companyName}`,
      react: ChangeOrderReceiptEmail({
        companyName,
        description: order.description,
        cost,
        dueDate,
        portalUrl: `${siteUrl}/p/${project.unique_token}`,
      }),
    });
  }
}

export async function declineChangeOrder(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  const project = await getProjectByToken(token);
  if (!project) {
    throw new Error("Invalid or expired portal link.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("change_orders")
    .update({ status: "declined" })
    .eq("id", changeOrderId)
    .eq("project_id", project.id)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Could not decline change order: ${error.message}`);
  }

  revalidatePath(`/p/${token}`);
}

export async function payChangeOrder(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  const project = await getProjectByToken(token);
  if (!project) {
    throw new Error("Invalid or expired portal link.");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: changeOrder }, { data: provider }] = await Promise.all([
    supabaseAdmin
      .from("change_orders")
      .select("id, description, cost, status, client_signed_at, provider_signed_at")
      .eq("id", changeOrderId)
      .eq("project_id", project.id)
      .maybeSingle(),
    supabaseAdmin
      .from("users")
      .select("stripe_account_id, stripe_connect_charges_enabled")
      .eq("id", project.user_id)
      .maybeSingle(),
  ]);

  // Settlement rule: a change order can only be paid — online or off —
  // once BOTH parties have signed. status='approved' alone only means the
  // client signed; the provider's countersignature (provider_signed_at,
  // set by countersignChangeOrder) is a separate, required gate.
  if (
    !changeOrder ||
    changeOrder.status !== "approved" ||
    !changeOrder.client_signed_at ||
    !changeOrder.provider_signed_at
  ) {
    throw new Error(
      "This change order isn't ready for payment yet — it needs both your signature and your contractor's countersignature first."
    );
  }

  // Payments always route directly to the provider's own connected Stripe
  // account (destination charge) — TradeLock's platform account never holds
  // client funds. A provider who hasn't finished Connect onboarding can't be
  // paid yet; the DB flag is a fast pre-check, and the Checkout Session
  // creation below is what actually enforces it (Stripe rejects a
  // destination that can't accept charges).
  if (!provider?.stripe_account_id || !provider.stripe_connect_charges_enabled) {
    throw new Error(
      "This contractor hasn't finished setting up payments yet. Please contact them directly."
    );
  }

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const unitAmount = Math.round(Number(changeOrder.cost) * 100);
  const applicationFeeAmount = getApplicationFeeAmount(unitAmount);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: { name: changeOrder.description.slice(0, 500) },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        transfer_data: { destination: provider.stripe_account_id },
        ...(applicationFeeAmount ? { application_fee_amount: applicationFeeAmount } : {}),
        metadata: { change_order_id: changeOrder.id },
      },
      metadata: {
        change_order_id: changeOrder.id,
        provider_account_id: provider.stripe_account_id,
      },
      success_url: `${siteUrl}/p/${token}?payment=success`,
      cancel_url: `${siteUrl}/p/${token}?payment=cancelled`,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("Stripe Connect checkout failed:", err.message);
      throw new Error(
        "This contractor's payment account isn't ready to accept payments yet. Please contact them directly."
      );
    }
    throw err;
  }

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}
