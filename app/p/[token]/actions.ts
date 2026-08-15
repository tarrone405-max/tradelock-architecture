"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Stripe from "stripe";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  getApplicationFeeAmount,
  isPlanTier,
} from "@/lib/plans";
import { sendEmail } from "@/lib/resend";
import { notifyFeedbackReceived } from "@/lib/notifyFeedback";

import ChangeOrderApprovedContractorEmail from "@/emails/ChangeOrderApprovedContractorEmail";
import ChangeOrderReceiptEmail from "@/emails/ChangeOrderReceiptEmail";
import NotificationEmail from "@/emails/NotificationEmail";
import type { FeedbackActionState } from "@/components/FeedbackForm";

const FEEDBACK_TYPES = ["bug", "suggestion"] as const;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// ============================================================
// GET PROJECT FROM PORTAL TOKEN
// ============================================================

async function getProjectByToken(token: string) {
  if (!token) {
    return null;
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .select(
      "id, user_id, client_name, client_email, unique_token"
    )
    .eq("unique_token", token)
    .is("portal_token_revoked_at", null)
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to load project by portal token:",
      error
    );

    return null;
  }

  return project;
}

// ============================================================
// CLIENT SIGNS CHANGE ORDER
// ============================================================

export async function signChangeOrder(formData: FormData) {
  const token = String(
    formData.get("token") ?? ""
  );

  const changeOrderId = String(
    formData.get("changeOrderId") ?? ""
  );

  const signatureData = String(
    formData.get("signatureData") ?? ""
  );

  const signatureName = String(
    formData.get("signatureName") ?? ""
  ).trim();

  const termsVersionId =
    String(
      formData.get("termsVersionId") ?? ""
    ) || null;

  const termsAccepted =
    formData.get("termsAccepted") === "on";

  // ----------------------------------------------------------
  // Validate signature
  // ----------------------------------------------------------

  if (!signatureData.startsWith("data:image/")) {
    throw new Error("A signature is required.");
  }

  if (!signatureName) {
    throw new Error(
      "Your full legal name is required to sign."
    );
  }

  // ----------------------------------------------------------
  // Validate portal token
  // ----------------------------------------------------------

  const project =
    await getProjectByToken(token);

  if (!project) {
    throw new Error(
      "Invalid or expired portal link."
    );
  }

  const supabaseAdmin =
    getSupabaseAdmin();

  // ----------------------------------------------------------
  // Check active Terms of Service
  // ----------------------------------------------------------

  const { data: activeTerms } =
    await supabaseAdmin
      .from("terms_of_service")
      .select("id")
      .eq("user_id", project.user_id)
      .eq("is_active", true)
      .maybeSingle();

  if (
    activeTerms &&
    (
      !termsAccepted ||
      termsVersionId !== activeTerms.id
    )
  ) {
    throw new Error(
      "You must agree to the current Terms of Service to sign."
    );
  }

  const now =
    new Date().toISOString();

  // ----------------------------------------------------------
  // Save signature
  // ----------------------------------------------------------

  const {
    data: updatedOrder,
    error,
  } = await supabaseAdmin
    .from("change_orders")
    .update({
      signature_data: signatureData,
      status: "approved",
      signed_at: now,
      client_signed_at: now,
      client_signature_name: signatureName,
      terms_version_id:
        activeTerms?.id ?? null,
      terms_accepted_at:
        activeTerms
          ? now
          : null,
    })
    .eq("id", changeOrderId)
    .eq("project_id", project.id)
    .eq("status", "pending")
    .select(
      "description, cost, due_date"
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not save signature: ${error.message}`
    );
  }

  // ----------------------------------------------------------
  // Send approval emails
  // ----------------------------------------------------------

  if (updatedOrder) {
    try {
      await notifyChangeOrderApproved({
        project,
        order: updatedOrder,
      });
    } catch (notifyError) {
      console.error(
        "Failed to send change order approval emails:",
        notifyError
      );
    }
  }

  revalidatePath(`/p/${token}`);
}

// ============================================================
// CHANGE ORDER APPROVAL EMAILS
// ============================================================

async function notifyChangeOrderApproved({
  project,
  order,
}: {
  project: {
    id: string;
    user_id: string;
    client_name: string;
    client_email: string | null;
    unique_token: string;
  };

  order: {
    description: string;
    cost: number;
    due_date: string | null;
  };
}) {
  const supabaseAdmin =
    getSupabaseAdmin();

  const { data: provider } =
    await supabaseAdmin
      .from("users")
      .select(
        "email, company_name"
      )
      .eq("id", project.user_id)
      .maybeSingle();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const cost =
    currency.format(
      Number(order.cost)
    );

  const companyName =
    provider?.company_name ??
    "Your contractor";

  const dueDate =
    order.due_date
      ? new Date(
          order.due_date +
            "T00:00:00"
        ).toLocaleDateString()
      : null;

  // ----------------------------------------------------------
  // Contractor email
  // ----------------------------------------------------------

  if (provider?.email) {
    await sendEmail({
      to: provider.email,

      subject:
        `Change order approved by ${project.client_name}`,

      react:
        ChangeOrderApprovedContractorEmail({
          clientName:
            project.client_name,

          description:
            order.description,

          cost,

          projectUrl:
            `${siteUrl}/dashboard/projects/${project.id}`,
        }),
    });
  }

  // ----------------------------------------------------------
  // Client receipt email
  // ----------------------------------------------------------

  if (project.client_email) {
    await sendEmail({
      to: project.client_email,

      subject:
        `You approved a change order with ${companyName}`,

      react:
        ChangeOrderReceiptEmail({
          companyName,

          description:
            order.description,

          cost,

          dueDate,

          portalUrl:
            `${siteUrl}/p/${project.unique_token}`,
        }),
    });
  }
}

// ============================================================
// DECLINE CHANGE ORDER
// ============================================================

export async function declineChangeOrder(
  formData: FormData
) {
  const token =
    String(
      formData.get("token") ?? ""
    );

  const changeOrderId =
    String(
      formData.get("changeOrderId") ?? ""
    );

  const project =
    await getProjectByToken(token);

  if (!project) {
    throw new Error(
      "Invalid or expired portal link."
    );
  }

  const supabaseAdmin =
    getSupabaseAdmin();

  const { error } =
    await supabaseAdmin
      .from("change_orders")
      .update({
        status: "declined",
      })
      .eq("id", changeOrderId)
      .eq("project_id", project.id)
      .eq("status", "pending");

  if (error) {
    throw new Error(
      `Could not decline change order: ${error.message}`
    );
  }

  revalidatePath(`/p/${token}`);
}

// ============================================================
// PAY CHANGE ORDER
// ============================================================

export async function payChangeOrder(
  formData: FormData
) {
  const token =
    String(
      formData.get("token") ?? ""
    );

  const changeOrderId =
    String(
      formData.get("changeOrderId") ?? ""
    );

  // ==========================================================
  // 1. VALIDATE PORTAL TOKEN
  // ==========================================================

  const project =
    await getProjectByToken(token);

  if (!project) {
    throw new Error(
      "Invalid or expired portal link."
    );
  }

  const supabaseAdmin =
    getSupabaseAdmin();

  // ==========================================================
  // 2. LOAD CHANGE ORDER + PROVIDER
  // ==========================================================

  const [
    { data: changeOrder },
    { data: provider },
  ] = await Promise.all([
    supabaseAdmin
      .from("change_orders")
      .select(
        `
          id,
          description,
          cost,
          status,
          client_signed_at,
          provider_signed_at
        `
      )
      .eq("id", changeOrderId)
      .eq("project_id", project.id)
      .maybeSingle(),

    supabaseAdmin
      .from("users")
      .select(
        `
          id,
          stripe_account_id,
          stripe_connect_charges_enabled,
          stripe_connect_payouts_enabled,
          subscription_tier
        `
      )
      .eq("id", project.user_id)
      .maybeSingle(),
  ]);

  // ==========================================================
  // 3. BOTH SIDES MUST HAVE SIGNED
  // ==========================================================

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

  // ==========================================================
  // 4. PROVIDER MUST HAVE STRIPE ACCOUNT
  // ==========================================================

  if (!provider?.stripe_account_id) {
    throw new Error(
      "This contractor hasn't finished setting up payments yet. Please contact them directly."
    );
  }

  const stripe =
    getStripe();

  // ==========================================================
  // 5. CHECK STRIPE CONNECT ACCOUNT
  // ==========================================================

  type ConnectedAccount =
    Awaited<
      ReturnType<
        typeof stripe.v2.core.accounts.retrieve
      >
    >;

  let connectedAccount:
    ConnectedAccount;

  try {
    connectedAccount =
      await stripe.v2.core.accounts.retrieve(
        provider.stripe_account_id,
        {
          include: [
            "configuration.merchant",
            "configuration.recipient",
            "requirements",
          ],
        }
      );
  } catch (error) {
    console.error(
      "Failed to retrieve connected Stripe account:",
      error
    );

    throw new Error(
      "We couldn't verify this contractor's Stripe payment account. Please try again."
    );
  }

  // ==========================================================
  // 6. CHECK CARD PAYMENTS
  // ==========================================================

  const chargesEnabled =
    connectedAccount
      .configuration
      ?.merchant
      ?.capabilities
      ?.card_payments
      ?.status === "active";

  // ==========================================================
  // 7. CHECK PAYOUTS
  // ==========================================================

  const payoutsEnabled =
    connectedAccount
      .configuration
      ?.merchant
      ?.capabilities
      ?.stripe_balance
      ?.payouts
      ?.status === "active";

  // ==========================================================
  // 8. CHECK TRANSFERS
  // ==========================================================

  const transfersEnabled =
    connectedAccount
      .configuration
      ?.recipient
      ?.capabilities
      ?.stripe_balance
      ?.stripe_transfers
      ?.status === "active";

  console.log(
    "=========================================="
  );

  console.log(
    "=== TRADELOCK STRIPE PAYMENT CHECK ==="
  );

  console.log(
    "Connected account:",
    provider.stripe_account_id
  );

  console.log(
    "Card payments:",
    connectedAccount
      .configuration
      ?.merchant
      ?.capabilities
      ?.card_payments
      ?.status
  );

  console.log(
    "Payouts:",
    connectedAccount
      .configuration
      ?.merchant
      ?.capabilities
      ?.stripe_balance
      ?.payouts
      ?.status
  );

  console.log(
    "Transfers:",
    connectedAccount
      .configuration
      ?.recipient
      ?.capabilities
      ?.stripe_balance
      ?.stripe_transfers
      ?.status
  );

  console.log(
    "=========================================="
  );

  // ==========================================================
  // 9. SYNCHRONIZE DATABASE
  // ==========================================================

  await supabaseAdmin
    .from("users")
    .update({
      stripe_connect_charges_enabled:
        chargesEnabled,

      stripe_connect_payouts_enabled:
        payoutsEnabled,
    })
    .eq("id", provider.id);

  // ==========================================================
  // 10. ACCOUNT MUST ACCEPT PAYMENTS
  // ==========================================================

  if (!chargesEnabled) {
    throw new Error(
      "This contractor's Stripe account isn't ready to accept payments yet. Please contact them directly."
    );
  }

  // ==========================================================
  // 11. ACCOUNT MUST SUPPORT TRANSFERS
  // ==========================================================

  if (!transfersEnabled) {
    throw new Error(
      "This contractor's Stripe account isn't enabled to receive payments yet. Please have them finish their Stripe payment setup."
    );
  }

  // ==========================================================
  // 12. VALIDATE PAYMENT AMOUNT
  // ==========================================================

  const cost =
    Number(changeOrder.cost);

  if (
    !Number.isFinite(cost) ||
    cost <= 0
  ) {
    throw new Error(
      "This change order has an invalid payment amount."
    );
  }

  const unitAmount =
    Math.round(cost * 100);

  if (unitAmount < 50) {
    throw new Error(
      "The payment amount is below Stripe's minimum."
    );
  }

  // ==========================================================
  // 13. SITE URL
  // ==========================================================

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  // ==========================================================
  // 14. DETERMINE APPLICATION FEE
  // ==========================================================

  const providerTier =
    isPlanTier(
      provider.subscription_tier
    )
      ? provider.subscription_tier
      : "free";

  const applicationFeeAmount =
    getApplicationFeeAmount(
      providerTier,
      unitAmount
    );

  console.log(
    "Provider plan:",
    providerTier
  );

  console.log(
    "Change order amount:",
    unitAmount
  );

  console.log(
    "TradeLock application fee:",
    applicationFeeAmount
  );

  // ==========================================================
  // 15. CREATE STRIPE CHECKOUT SESSION
  // ==========================================================

  let session:
    Stripe.Checkout.Session;

  try {
    session =
      await stripe.checkout.sessions.create({
        mode: "payment",

        payment_method_types: [
          "card",
        ],

        line_items: [
          {
            price_data: {
              currency: "usd",

              unit_amount:
                unitAmount,

              product_data: {
                name:
                  changeOrder.description.slice(
                    0,
                    500
                  ),
              },
            },

            quantity: 1,
          },
        ],

        payment_intent_data: {
          transfer_data: {
            destination:
              provider.stripe_account_id,
          },

          ...(applicationFeeAmount !==
            undefined &&
          applicationFeeAmount > 0
            ? {
                application_fee_amount:
                  applicationFeeAmount,
              }
            : {}),

          metadata: {
            change_order_id:
              changeOrder.id,

            provider_account_id:
              provider.stripe_account_id,

            project_id:
              project.id,
          },
        },

        metadata: {
          change_order_id:
            changeOrder.id,

          provider_account_id:
            provider.stripe_account_id,

          project_id:
            project.id,

          provider_plan:
            providerTier,
        },

        // IMPORTANT:
        // Stripe replaces {CHECKOUT_SESSION_ID}
        // with the actual Checkout Session ID.
        //
        // The webhook remains the authoritative
        // source for confirming payment.

        success_url:
          `${siteUrl}/p/${token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${siteUrl}/p/${token}?payment=cancelled`,
      });
  } catch (error) {
    console.error(
      "Stripe Checkout creation failed:",
      error
    );

    if (
      error instanceof
      Stripe.errors.StripeError
    ) {
      console.error(
        "Stripe error code:",
        error.code
      );

      console.error(
        "Stripe error message:",
        error.message
      );

      throw new Error(
        "This contractor's Stripe payment account isn't ready to accept this payment yet. Please contact them directly."
      );
    }

    throw error;
  }

  // ==========================================================
  // 16. VERIFY CHECKOUT URL
  // ==========================================================

  if (!session.url) {
    throw new Error(
      "Stripe did not return a checkout URL."
    );
  }

  // ==========================================================
  // 17. SEND HOMEOWNER TO STRIPE
  // ==========================================================

  redirect(session.url);
}

// ============================================================
// CLIENT SENDS MESSAGE
// ============================================================
//
// Client's half of project messaging — same token-validation pattern as
// every other portal write in this file, service-role client since
// homeowners have no Supabase Auth session/RLS path of their own.

export async function sendClientMessage(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  const project = await getProjectByToken(token);
  if (!project) {
    throw new Error("Invalid or expired portal link.");
  }

  if (!body) {
    throw new Error("A message is required.");
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from("messages").insert({
    project_id: project.id,
    sender_type: "client",
    body,
  });

  if (error) {
    throw new Error(`Could not send message: ${error.message}`);
  }

  try {
    const { data: provider } = await supabaseAdmin
      .from("users")
      .select("email, company_name")
      .eq("id", project.user_id)
      .maybeSingle();

    if (provider?.email) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

      await sendEmail({
        to: provider.email,
        subject: `New message from ${project.client_name}`,
        react: NotificationEmail({
          preview: `${project.client_name} sent you a new message on TradeLock`,
          heading: "You have a new message",
          body: `${project.client_name} sent you a message. Reply from your TradeLock dashboard.`,
          ctaLabel: "View message",
          ctaUrl: `${siteUrl}/dashboard/projects/${project.id}`,
          footer: "Sent by TradeLock.",
        }),
      });
    }
  } catch (notifyError) {
    console.error("Failed to send new-message notification:", notifyError);
  }

  revalidatePath(`/p/${token}`);
}

// ============================================================
// CLIENT SUBMITS A REVIEW
// ============================================================
//
// One review per project (enforced by the unique constraint on
// reviews.project_id, not just this check), only after at least one paid
// change order — leaving a review before any money has actually changed
// hands wouldn't mean much.

export async function submitReview(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const ratingInput = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim() || null;

  const project = await getProjectByToken(token);
  if (!project) {
    throw new Error("Invalid or expired portal link.");
  }

  if (!Number.isInteger(ratingInput) || ratingInput < 1 || ratingInput > 5) {
    throw new Error("Choose a rating between 1 and 5 stars.");
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: hasPaidOrder } = await supabaseAdmin
    .from("change_orders")
    .select("id")
    .eq("project_id", project.id)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (!hasPaidOrder) {
    throw new Error("You can leave a review once you've made a payment.");
  }

  const { error } = await supabaseAdmin.from("reviews").insert({
    project_id: project.id,
    user_id: project.user_id,
    rating: ratingInput,
    comment,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("You've already left a review for this project.");
    }
    throw new Error(`Could not save your review: ${error.message}`);
  }

  try {
    const { data: provider } = await supabaseAdmin
      .from("users")
      .select("email, company_name")
      .eq("id", project.user_id)
      .maybeSingle();

    if (provider?.email) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

      await sendEmail({
        to: provider.email,
        subject: `${project.client_name} left you a ${ratingInput}-star review`,
        react: NotificationEmail({
          preview: `New ${ratingInput}-star review from ${project.client_name}`,
          heading: "You received a new review",
          body: `${project.client_name} rated their experience ${ratingInput}/5.${comment ? `\n\n"${comment}"` : ""}`,
          ctaLabel: "View review",
          ctaUrl: `${siteUrl}/dashboard/projects/${project.id}`,
          footer: "Sent by TradeLock.",
        }),
      });
    }
  } catch (notifyError) {
    console.error("Failed to send review notification:", notifyError);
  }

  revalidatePath(`/p/${token}`);
}

// ============================================================
// CLIENT SUBMITS FEEDBACK
// ============================================================
//
// A client's half of the bug-report/suggestion channel — see
// app/(dashboard)/dashboard/actions.ts's submitFeedback for the provider
// half. Addressed to whoever operates TradeLock, not to the client's own
// contractor, so — unlike everything else in this file — there's nothing to
// revalidate afterward; the portal page doesn't display past feedback.

export async function submitClientFeedback(
  _prevState: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  const token = String(formData.get("token") ?? "");
  const feedbackType = String(formData.get("feedbackType") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;

  const project = await getProjectByToken(token);
  if (!project) {
    return { error: "Invalid or expired portal link.", success: false };
  }

  if (!(FEEDBACK_TYPES as readonly string[]).includes(feedbackType)) {
    return { error: "Choose whether this is a bug report or a suggestion.", success: false };
  }

  if (!message) {
    return { error: "Please describe the bug or suggestion.", success: false };
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { error } = await supabaseAdmin.from("feedback").insert({
    submitted_by: "client",
    project_id: project.id,
    feedback_type: feedbackType,
    message,
    contact_email: contactEmail ?? project.client_email,
  });

  if (error) {
    return { error: `Could not send feedback: ${error.message}`, success: false };
  }

  try {
    await notifyFeedbackReceived({
      feedbackType: feedbackType as "bug" | "suggestion",
      message,
      contactEmail: contactEmail ?? project.client_email,
      from: `${project.client_name} (client)`,
    });
  } catch (notifyError) {
    console.error("Failed to send feedback notification:", notifyError);
  }

  return { error: null, success: true };
}