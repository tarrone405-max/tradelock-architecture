import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  hasProcessedWebhookEvent,
  markWebhookEventProcessed,
} from "@/lib/stripeWebhookEvents";

import {
  GRACE_PERIOD_DAYS,
  getTierForStripePriceId,
  isPlanTier,
  type PlanTier,
} from "@/lib/plans";

export const runtime = "nodejs";

// ============================================================
// SUBSCRIPTION STATUS MAPPING
// ============================================================

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status
):
  | "active"
  | "past_due"
  | "canceled"
  | "inactive" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";

    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";

    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";

    default:
      return "inactive";
  }
}

// ============================================================
// SUBSCRIPTION TIER STATE MACHINE
// ============================================================

function resolveSubscriptionTierUpdate(params: {
  mappedStatus:
    | "active"
    | "past_due"
    | "canceled"
    | "inactive";

  priceId: string | undefined;

  currentTier: PlanTier;

  currentGracePeriodStartedAt:
    | string
    | null;

  eventCreatedAt: string;
}): {
  tier: PlanTier;
  gracePeriodStartedAt: string | null;
} {
  const {
    mappedStatus,
    priceId,
    currentTier,
    currentGracePeriodStartedAt,
    eventCreatedAt,
  } = params;

  // ----------------------------------------------------------
  // ACTIVE
  // ----------------------------------------------------------

  if (mappedStatus === "active") {
    const resolvedTier = priceId
      ? getTierForStripePriceId(priceId)
      : null;

    if (!resolvedTier) {
      console.error(
        `Active subscription on price "${priceId ?? "none"}" ` +
          `doesn't match any configured plan. ` +
          `Leaving subscription_tier unchanged.`
      );

      return {
        tier: currentTier,
        gracePeriodStartedAt: null,
      };
    }

    return {
      tier: resolvedTier,
      gracePeriodStartedAt: null,
    };
  }

  // ----------------------------------------------------------
  // PAST DUE
  // ----------------------------------------------------------

  if (mappedStatus === "past_due") {
    // First past_due event starts the grace period.
    if (!currentGracePeriodStartedAt) {
      return {
        tier: currentTier,
        gracePeriodStartedAt: eventCreatedAt,
      };
    }

    const elapsedMs =
      new Date(eventCreatedAt).getTime() -
      new Date(
        currentGracePeriodStartedAt
      ).getTime();

    const graceExpired =
      elapsedMs >
      GRACE_PERIOD_DAYS *
        24 *
        60 *
        60 *
        1000;

    if (graceExpired) {
      return {
        tier: "free",
        gracePeriodStartedAt: null,
      };
    }

    return {
      tier: currentTier,
      gracePeriodStartedAt:
        currentGracePeriodStartedAt,
    };
  }

  // ----------------------------------------------------------
  // CANCELED / INACTIVE
  // ----------------------------------------------------------

  return {
    tier: "free",
    gracePeriodStartedAt: null,
  };
}

// ============================================================
// GET PROJECT TOKEN FOR REVALIDATION
// ============================================================

async function getProjectTokenById(
  projectId: string,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  const { data, error } =
    await supabaseAdmin
      .from("projects")
      .select("unique_token")
      .eq("id", projectId)
      .maybeSingle();

  if (error) {
    console.error(
      `Failed to find portal token for project ${projectId}:`,
      error
    );

    return null;
  }

  return data?.unique_token ?? null;
}

// ============================================================
// MARK CHANGE ORDER PAID FROM PAYMENT INTENT
// ============================================================

async function markChangeOrderPaidFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  stripe: Stripe,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  const metadata =
    paymentIntent.metadata ?? {};

  const changeOrderId =
    metadata.change_order_id ?? null;

  const expectedAccountId =
    metadata.provider_account_id ?? null;

  const projectId =
    metadata.project_id ?? null;

  // This PaymentIntent isn't one of TradeLock's
  // change-order payments.
  if (!changeOrderId) {
    return;
  }

  // ----------------------------------------------------------
  // Verify destination
  // ----------------------------------------------------------

  const actualDestination =
    typeof paymentIntent.transfer_data
      ?.destination === "string"
      ? paymentIntent.transfer_data
          .destination
      : paymentIntent.transfer_data
          ?.destination?.id ?? null;

  if (
    expectedAccountId &&
    actualDestination !== expectedAccountId
  ) {
    console.error(
      `Refusing to mark change order ${changeOrderId} paid. ` +
        `PaymentIntent ${paymentIntent.id} destination ` +
        `"${actualDestination}" does not match expected ` +
        `provider account "${expectedAccountId}".`
    );

    return;
  }

  // ----------------------------------------------------------
  // Get charge ID
  // ----------------------------------------------------------

  const chargeId =
    typeof paymentIntent.latest_charge ===
    "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ??
        null;

  // ----------------------------------------------------------
  // Get application fee
  // ----------------------------------------------------------

  const applicationFeeAmount =
    paymentIntent.application_fee_amount ??
    null;

  // ----------------------------------------------------------
  // Make sure payment really succeeded
  // ----------------------------------------------------------

  if (
    paymentIntent.status !==
    "succeeded"
  ) {
    console.log(
      `PaymentIntent ${paymentIntent.id} ` +
        `for change order ${changeOrderId} ` +
        `is not succeeded. Current status: ` +
        `${paymentIntent.status}`
    );

    return;
  }

  // ----------------------------------------------------------
  // Update change order
  // ----------------------------------------------------------

  const { data: updatedOrder, error } =
    await supabaseAdmin
      .from("change_orders")
      .update({
        status: "paid",

        paid_at:
          new Date().toISOString(),

        stripe_payment_intent_id:
          paymentIntent.id,

        stripe_connected_account_id:
          expectedAccountId,

        stripe_charge_id:
          chargeId,

        currency:
          paymentIntent.currency,

        application_fee_amount:
          applicationFeeAmount,
      })
      .eq("id", changeOrderId)
      .eq("status", "approved")
      .select("id, project_id")
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to mark change order ${changeOrderId} as paid: ${error.message}`
    );
  }

  // ----------------------------------------------------------
  // Revalidation
  // ----------------------------------------------------------

  if (updatedOrder?.project_id) {
    const token =
      await getProjectTokenById(
        updatedOrder.project_id,
        supabaseAdmin
      );

    if (token) {
      revalidatePath(
        `/p/${token}`
      );
    }
  }
}

// ============================================================
// MARK CHECKOUT SESSION PAYMENT PAID
// ============================================================

async function markChangeOrderPaid(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  const changeOrderId =
    session.metadata?.change_order_id;

  if (!changeOrderId) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent ===
    "string"
      ? session.payment_intent
      : session.payment_intent?.id ??
        null;

  if (!paymentIntentId) {
    console.error(
      `Checkout Session ${session.id} ` +
        `for change order ${changeOrderId} ` +
        `has no PaymentIntent.`
    );

    return;
  }

  const paymentIntent =
    await stripe.paymentIntents.retrieve(
      paymentIntentId
    );

  // ----------------------------------------------------------
  // Verify session metadata against PaymentIntent
  // ----------------------------------------------------------

  const expectedAccountId =
    session.metadata
      ?.provider_account_id ??
    null;

  const paymentIntentAccountId =
    paymentIntent.metadata
      ?.provider_account_id ??
    null;

  if (
    expectedAccountId &&
    paymentIntentAccountId &&
    expectedAccountId !==
      paymentIntentAccountId
  ) {
    console.error(
      `Refusing to mark change order ${changeOrderId} paid. ` +
        `Checkout Session provider account "${expectedAccountId}" ` +
        `does not match PaymentIntent provider account ` +
        `"${paymentIntentAccountId}".`
    );

    return;
  }

  // ----------------------------------------------------------
  // Ensure payment succeeded
  // ----------------------------------------------------------

  if (
    paymentIntent.status !==
    "succeeded"
  ) {
    console.log(
      `Checkout Session ${session.id} ` +
        `for change order ${changeOrderId} ` +
        `has PaymentIntent status ` +
        `"${paymentIntent.status}".`
    );

    return;
  }

  // ----------------------------------------------------------
  // Verify destination
  // ----------------------------------------------------------

  const actualDestination =
    typeof paymentIntent.transfer_data
      ?.destination === "string"
      ? paymentIntent.transfer_data
          .destination
      : paymentIntent.transfer_data
          ?.destination?.id ??
        null;

  if (
    expectedAccountId &&
    actualDestination !==
      expectedAccountId
  ) {
    console.error(
      `Refusing to mark change order ${changeOrderId} paid. ` +
        `PaymentIntent destination "${actualDestination}" ` +
        `does not match provider account ` +
        `"${expectedAccountId}".`
    );

    return;
  }

  // ----------------------------------------------------------
  // Get charge ID
  // ----------------------------------------------------------

  const chargeId =
    typeof paymentIntent.latest_charge ===
    "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ??
        null;

  // ----------------------------------------------------------
  // Update change order
  // ----------------------------------------------------------

  const {
    data: updatedOrder,
    error,
  } = await supabaseAdmin
    .from("change_orders")
    .update({
      status: "paid",

      paid_at:
        new Date().toISOString(),

      stripe_checkout_session_id:
        session.id,

      stripe_payment_intent_id:
        paymentIntent.id,

      stripe_connected_account_id:
        expectedAccountId,

      stripe_charge_id:
        chargeId,

      currency:
        paymentIntent.currency,

      application_fee_amount:
        paymentIntent.application_fee_amount ??
        null,
    })
    .eq("id", changeOrderId)
    .eq("status", "approved")
    .select("id, project_id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to mark change order ${changeOrderId} as paid: ${error.message}`
    );
  }

  // ----------------------------------------------------------
  // Revalidate homeowner portal
  // ----------------------------------------------------------

  if (updatedOrder?.project_id) {
    const token =
      await getProjectTokenById(
        updatedOrder.project_id,
        supabaseAdmin
      );

    if (token) {
      revalidatePath(
        `/p/${token}`
      );
    }
  }
}

// ============================================================
// SYNC CHANGE ORDER REFUND
// ============================================================
//
// charge.amount_refunded is Stripe's own cumulative total (not something we
// increment ourselves), so re-processing this event — a retry, or a second
// partial refund on the same charge — is naturally idempotent: we're always
// just writing back Stripe's current authoritative number.

async function syncChangeOrderRefund(
  charge: Stripe.Charge,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  const paymentIntentId =
    typeof charge.payment_intent ===
    "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ??
        null;

  // Look up by charge id first (the field markChangeOrderPaid/
  // markChangeOrderPaidFromPaymentIntent always records), falling back to
  // payment intent id for safety.
  const byCharge =
    await supabaseAdmin
      .from("change_orders")
      .select(
        "id, project_id, cost, status"
      )
      .eq("stripe_charge_id", charge.id)
      .maybeSingle();

  let changeOrder = byCharge.data;

  if (!changeOrder && paymentIntentId) {
    const byIntent =
      await supabaseAdmin
        .from("change_orders")
        .select(
          "id, project_id, cost, status"
        )
        .eq(
          "stripe_payment_intent_id",
          paymentIntentId
        )
        .maybeSingle();

    changeOrder = byIntent.data;
  }

  if (!changeOrder) {
    console.error(
      `Refund for charge ${charge.id} doesn't match any change order.`
    );

    return;
  }

  const latestRefundId =
    typeof charge.refunds?.data?.[0]
      ?.id === "string"
      ? charge.refunds.data[0].id
      : null;

  const isFullyRefunded =
    charge.amount_refunded >=
    charge.amount;

  const { error } =
    await supabaseAdmin
      .from("change_orders")
      .update({
        status: isFullyRefunded
          ? "refunded"
          : changeOrder.status,

        refunded_amount:
          charge.amount_refunded,

        refunded_at:
          new Date().toISOString(),

        stripe_refund_id:
          latestRefundId,
      })
      .eq("id", changeOrder.id);

  if (error) {
    throw new Error(
      `Failed to record refund for change order ${changeOrder.id}: ${error.message}`
    );
  }

  console.log(
    `Refund synced for change order ${changeOrder.id}: ` +
      `${charge.amount_refunded}/${charge.amount} refunded ` +
      `(fully refunded: ${isFullyRefunded})`
  );

  if (changeOrder.project_id) {
    const token =
      await getProjectTokenById(
        changeOrder.project_id,
        supabaseAdmin
      );

    if (token) {
      revalidatePath(`/p/${token}`);
    }
  }
}

// ============================================================
// SYNC CHANGE ORDER DISPUTE
// ============================================================
//
// dispute_status is overwritten with Stripe's current status on every
// dispute.created/updated/closed event; disputed_at is set once, on first
// sight, and preserved across later updates.

async function syncChangeOrderDispute(
  dispute: Stripe.Dispute,
  eventType: string,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  const chargeId =
    typeof dispute.charge === "string"
      ? dispute.charge
      : dispute.charge?.id ?? null;

  if (!chargeId) {
    return;
  }

  const { data: changeOrder } =
    await supabaseAdmin
      .from("change_orders")
      .select(
        "id, project_id, disputed_at"
      )
      .eq("stripe_charge_id", chargeId)
      .maybeSingle();

  if (!changeOrder) {
    console.error(
      `Dispute ${dispute.id} (${eventType}) for charge ${chargeId} ` +
        `doesn't match any change order.`
    );

    return;
  }

  const { error } =
    await supabaseAdmin
      .from("change_orders")
      .update({
        stripe_dispute_id: dispute.id,

        dispute_status:
          dispute.status,

        disputed_at:
          changeOrder.disputed_at ??
          new Date().toISOString(),
      })
      .eq("id", changeOrder.id);

  if (error) {
    throw new Error(
      `Failed to record dispute ${dispute.id} for change order ${changeOrder.id}: ${error.message}`
    );
  }

  console.log(
    `Dispute synced for change order ${changeOrder.id}: ` +
      `${dispute.status} (${eventType})`
  );

  if (changeOrder.project_id) {
    const token =
      await getProjectTokenById(
        changeOrder.project_id,
        supabaseAdmin
      );

    if (token) {
      revalidatePath(`/p/${token}`);
    }
  }
}

// ============================================================
// STRIPE EVENT HANDLER
// ============================================================

async function handleEvent(
  event: Stripe.Event,
  stripe: Stripe,
  supabaseAdmin: ReturnType<
    typeof getSupabaseAdmin
  >
) {
  switch (event.type) {
    // ========================================================
    // CHECKOUT SESSION COMPLETED
    // ========================================================

    case "checkout.session.completed": {
      const session =
        event.data.object as Stripe.Checkout.Session;

      // ------------------------------------------------------
      // Subscription checkout
      // ------------------------------------------------------

      if (
        session.mode ===
        "subscription"
      ) {
        const supabaseUserId =
          session.client_reference_id ??
          session.metadata
            ?.supabase_user_id ??
          null;

        const customerId =
          typeof session.customer ===
          "string"
            ? session.customer
            : session.customer?.id ??
              null;

        const subscriptionId =
          typeof session.subscription ===
          "string"
            ? session.subscription
            : session.subscription?.id ??
              null;

        if (
          !supabaseUserId ||
          !customerId ||
          !subscriptionId
        ) {
          console.error(
            `Subscription Checkout Session ${session.id} ` +
              `is missing user, customer, or subscription information.`
          );

          break;
        }

        // ----------------------------------------------------
        // Retrieve the actual Stripe subscription
        // ----------------------------------------------------

        const subscription =
          await stripe.subscriptions.retrieve(
            subscriptionId
          );

        // ----------------------------------------------------
        // Get actual Stripe Price
        // ----------------------------------------------------

        const priceId =
          subscription.items.data[0]
            ?.price?.id;

        // ----------------------------------------------------
        // Resolve TradeLock tier from actual Price ID
        // ----------------------------------------------------
        //
        // If this doesn't resolve (e.g. a Price env var mismatch), do NOT
        // bail out of the whole sync — stripe_customer_id,
        // stripe_subscription_id, and subscription_status are all still
        // knowable facts and must still be recorded. subscription_tier is
        // simply left out of this update (whatever's currently stored
        // stays), and customer.subscription.created — which Stripe always
        // fires for the same checkout — will independently retry the same
        // resolution moments later, so this self-heals once the price
        // configuration is fixed without needing a special recovery path.

        const resolvedTier =
          priceId
            ? getTierForStripePriceId(
                priceId
              )
            : null;

        if (!resolvedTier) {
          console.error(
            `Checkout subscription ${subscription.id} uses Stripe price ` +
              `"${priceId ?? "none"}", which does not match a configured ` +
              `TradeLock plan (STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_BUSINESS). ` +
              `Recording customer/subscription/status now regardless — ` +
              `subscription_tier will stay as-is until it resolves.`
          );
        }

        // ----------------------------------------------------
        // Map Stripe subscription status
        // ----------------------------------------------------

        const mappedStatus =
          mapSubscriptionStatus(
            subscription.status
          );

        const eventCreatedAt =
          new Date(
            event.created * 1000
          ).toISOString();

        // ----------------------------------------------------
        // Update user's billing state
        // ----------------------------------------------------

        const fields: {
          stripe_customer_id: string;
          stripe_subscription_id: string;
          subscription_status:
            | "active"
            | "past_due"
            | "canceled"
            | "inactive";
          subscription_grace_period_started_at: null;
          trial_ends_at: string | null;
          stripe_subscription_event_at: string;
          subscription_tier?: PlanTier;
        } = {
          stripe_customer_id:
            customerId,

          stripe_subscription_id:
            subscription.id,

          subscription_status:
            mappedStatus,

          subscription_grace_period_started_at:
            null,

          trial_ends_at:
            subscription.trial_end
              ? new Date(
                  subscription.trial_end *
                    1000
                ).toISOString()
              : null,

          stripe_subscription_event_at:
            eventCreatedAt,
        };

        if (resolvedTier) {
          fields.subscription_tier =
            resolvedTier;
        }

        const { error } =
          await supabaseAdmin
            .from("users")
            .update(fields)
            .eq(
              "id",
              supabaseUserId
            );

        if (error) {
          throw new Error(
            `Failed to sync subscription after checkout: ${error.message}`
          );
        }

        console.log(
          "=========================================="
        );

        console.log(
          "=== TRADELOCK CHECKOUT SUBSCRIPTION SYNC ==="
        );

        console.log(
          "User:",
          supabaseUserId
        );

        console.log(
          "Stripe customer:",
          customerId
        );

        console.log(
          "Stripe subscription:",
          subscription.id
        );

        console.log(
          "Stripe price:",
          priceId
        );

        console.log(
          "Subscription status:",
          subscription.status
        );

        console.log(
          "TradeLock status:",
          mappedStatus
        );

        console.log(
          "TradeLock plan:",
          resolvedTier ??
            "(unresolved — left unchanged)"
        );

        console.log(
          "=========================================="
        );

        break;
      }

      // ------------------------------------------------------
      // One-time change-order payment
      // ------------------------------------------------------

      if (
        session.mode ===
          "payment" &&
        session.metadata
          ?.change_order_id
      ) {
        if (
          session.payment_status ===
          "paid"
        ) {
          await markChangeOrderPaid(
            session,
            stripe,
            supabaseAdmin
          );
        } else {
          console.log(
            `Checkout Session ${session.id} ` +
              `completed but payment status is ` +
              `"${session.payment_status}".`
          );
        }
      }

      break;
    }

    // ========================================================
    // ASYNC PAYMENT SUCCEEDED
    // ========================================================

    case "checkout.session.async_payment_succeeded": {
      const session =
        event.data.object as Stripe.Checkout.Session;

      if (
        session.mode ===
        "payment"
      ) {
        await markChangeOrderPaid(
          session,
          stripe,
          supabaseAdmin
        );
      }

      break;
    }

    // ========================================================
    // ASYNC PAYMENT FAILED
    // ========================================================

    case "checkout.session.async_payment_failed": {
      const session =
        event.data.object as Stripe.Checkout.Session;

      const changeOrderId =
        session.metadata
          ?.change_order_id;

      if (changeOrderId) {
        console.error(
          `Async payment failed for change order ${changeOrderId}.`
        );
      }

      break;
    }

    // ========================================================
    // PAYMENT INTENT SUCCEEDED
    // ========================================================

    case "payment_intent.succeeded": {
      const paymentIntent =
        event.data.object as Stripe.PaymentIntent;

      if (
        paymentIntent.metadata
          ?.change_order_id
      ) {
        await markChangeOrderPaidFromPaymentIntent(
          paymentIntent,
          stripe,
          supabaseAdmin
        );
      }

      break;
    }

    // ========================================================
    // SUBSCRIPTION EVENTS
    // ========================================================

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription =
        event.data.object as Stripe.Subscription;

      const customerId =
        typeof subscription.customer ===
        "string"
          ? subscription.customer
          : subscription.customer.id;

      const metadataUserId =
        subscription.metadata
          ?.supabase_user_id ??
        null;

      const eventCreatedAt =
        new Date(
          event.created * 1000
        ).toISOString();

      let currentUser:
        | {
            id: string;

            stripe_customer_id:
              | string
              | null;

            subscription_tier:
              | string
              | null;

            subscription_grace_period_started_at:
              | string
              | null;

            stripe_subscription_event_at:
              | string
              | null;
          }
        | null = null;

      let selectError:
        | {
            message: string;
          }
        | null = null;

      // ------------------------------------------------------
      // Preferred lookup by metadata user ID
      // ------------------------------------------------------

      if (metadataUserId) {
        const result =
          await supabaseAdmin
            .from("users")
            .select(
              `
                id,
                stripe_customer_id,
                subscription_tier,
                subscription_grace_period_started_at,
                stripe_subscription_event_at
              `
            )
            .eq(
              "id",
              metadataUserId
            )
            .maybeSingle();

        currentUser =
          result.data;

        selectError =
          result.error;

        if (
          currentUser &&
          currentUser.stripe_customer_id &&
          currentUser.stripe_customer_id !==
            customerId
        ) {
          console.error(
            `Stripe customer mismatch for TradeLock user ${metadataUserId}. ` +
              `Expected "${currentUser.stripe_customer_id}", ` +
              `received "${customerId}".`
          );

          currentUser = null;
        }
      }

      // ------------------------------------------------------
      // Fallback lookup by Stripe customer
      // ------------------------------------------------------

      if (
        !currentUser &&
        !selectError
      ) {
        const result =
          await supabaseAdmin
            .from("users")
            .select(
              `
                id,
                stripe_customer_id,
                subscription_tier,
                subscription_grace_period_started_at,
                stripe_subscription_event_at
              `
            )
            .eq(
              "stripe_customer_id",
              customerId
            )
            .maybeSingle();

        currentUser =
          result.data;

        selectError =
          result.error;
      }

      if (selectError) {
        throw new Error(
          `Failed to look up user for subscription sync: ${selectError.message}`
        );
      }

      if (!currentUser) {
        console.error(
          `Could not find TradeLock user for Stripe subscription ` +
            `${subscription.id} ` +
            `(customer ${customerId}, ` +
            `metadata user ${metadataUserId ?? "none"})`
        );

        break;
      }

      // ------------------------------------------------------
      // Ignore stale subscription events
      // ------------------------------------------------------

      if (
        currentUser.stripe_subscription_event_at &&
        currentUser
          .stripe_subscription_event_at >=
          eventCreatedAt
      ) {
        console.log(
          `Skipping stale subscription event ${event.id} ` +
            `(${event.type}) for customer ${customerId}`
        );

        break;
      }

      // ------------------------------------------------------
      // Map subscription status
      // ------------------------------------------------------

      const mappedStatus =
        event.type ===
        "customer.subscription.deleted"
          ? "canceled"
          : mapSubscriptionStatus(
              subscription.status
            );

      // ------------------------------------------------------
      // Resolve current plan
      // ------------------------------------------------------

      const currentTier: PlanTier =
        isPlanTier(
          currentUser.subscription_tier
        )
          ? currentUser.subscription_tier
          : "free";

      const {
        tier,
        gracePeriodStartedAt,
      } =
        resolveSubscriptionTierUpdate({
          mappedStatus,

          priceId:
            subscription.items
              .data[0]?.price?.id,

          currentTier,

          currentGracePeriodStartedAt:
            currentUser
              .subscription_grace_period_started_at,

          eventCreatedAt,
        });

      // ------------------------------------------------------
      // Update user subscription
      // ------------------------------------------------------

      const { error } =
        await supabaseAdmin
          .from("users")
          .update({
            stripe_customer_id:
              customerId,

            subscription_status:
              mappedStatus,

            subscription_tier:
              tier,

            subscription_grace_period_started_at:
              gracePeriodStartedAt,

            stripe_subscription_id:
              subscription.id,

            trial_ends_at:
              subscription.trial_end
                ? new Date(
                    subscription.trial_end *
                      1000
                  ).toISOString()
                : null,

            stripe_subscription_event_at:
              eventCreatedAt,
          })
          .eq(
            "id",
            currentUser.id
          );

      if (error) {
        throw new Error(
          `Failed to sync subscription status: ${error.message}`
        );
      }

      console.log(
        "=========================================="
      );

      console.log(
        "=== TRADELOCK SUBSCRIPTION SYNC ==="
      );

      console.log(
        "User:",
        currentUser.id
      );

      console.log(
        "Stripe customer:",
        customerId
      );

      console.log(
        "Stripe subscription:",
        subscription.id
      );

      console.log(
        "Stripe price:",
        subscription.items
          .data[0]?.price?.id
      );

      console.log(
        "Subscription status:",
        subscription.status
      );

      console.log(
        "TradeLock status:",
        mappedStatus
      );

      console.log(
        "TradeLock plan:",
        tier
      );

      console.log(
        "=========================================="
      );

      break;
    }

    // ========================================================
    // CHARGE REFUNDED
    // ========================================================
    //
    // Fires for both full and partial refunds, and whether the refund was
    // initiated through TradeLock's refundChangeOrder action or directly
    // in the Stripe Dashboard — either way this event is what actually
    // updates Supabase, not the action that requested the refund.

    case "charge.refunded": {
      const charge =
        event.data.object as Stripe.Charge;

      await syncChangeOrderRefund(
        charge,
        supabaseAdmin
      );

      break;
    }

    // ========================================================
    // DISPUTES (CHARGEBACKS)
    // ========================================================

    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute =
        event.data.object as Stripe.Dispute;

      await syncChangeOrderDispute(
        dispute,
        event.type,
        supabaseAdmin
      );

      break;
    }

    // ========================================================
    // IGNORE OTHER EVENTS
    // ========================================================

    default:
      break;
  }
}

// ============================================================
// POST / STRIPE WEBHOOK
// ============================================================

export async function POST(
  request: Request
) {
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error(
      "Missing STRIPE_WEBHOOK_SECRET environment variable."
    );

    return NextResponse.json(
      {
        error:
          "Webhook not configured",
      },
      {
        status: 500,
      }
    );
  }

  const signature =
    request.headers.get(
      "stripe-signature"
    );

  if (!signature) {
    return NextResponse.json(
      {
        error:
          "Missing stripe-signature header",
      },
      {
        status: 400,
      }
    );
  }

  // IMPORTANT:
  // Stripe signature verification MUST use the raw body.
  const rawBody =
    await request.text();

  const stripe =
    getStripe();

  const supabaseAdmin =
    getSupabaseAdmin();

  // ==========================================================
  // VERIFY WEBHOOK SIGNATURE
  // ==========================================================

  let event: Stripe.Event;

  try {
    event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error";

    console.error(
      `Stripe webhook signature verification failed: ${message}`
    );

    return NextResponse.json(
      {
        error:
          `Webhook Error: ${message}`,
      },
      {
        status: 400,
      }
    );
  }

  // ==========================================================
  // IDEMPOTENCY CHECK
  // ==========================================================

  if (
    await hasProcessedWebhookEvent(
      supabaseAdmin,
      event.id
    )
  ) {
    return NextResponse.json({
      received: true,
      duplicate: true,
    });
  }

  // ==========================================================
  // PROCESS EVENT
  // ==========================================================

  try {
    await handleEvent(
      event,
      stripe,
      supabaseAdmin
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error";

    console.error(
      `Failed to process Stripe webhook event ` +
        `${event.id} (${event.type}): ${message}`
    );

    // Do NOT mark the event processed.
    // Stripe will retry because we return HTTP 500.

    return NextResponse.json(
      {
        error:
          "Webhook processing failed",
      },
      {
        status: 500,
      }
    );
  }

  // ==========================================================
  // MARK EVENT PROCESSED
  // ==========================================================

  try {
    await markWebhookEventProcessed(
      supabaseAdmin,
      event,
      "platform"
    );
  } catch (err) {
    console.error(
      `Failed to record processed Stripe webhook event ${event.id}:`,
      err
    );

    // Returning 500 is intentional here.
    // Stripe should retry if the processed-event record failed.

    return NextResponse.json(
      {
        error:
          "Failed to record webhook completion",
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    received: true,
  });
}