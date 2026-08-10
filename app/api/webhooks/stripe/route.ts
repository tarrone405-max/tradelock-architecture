import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function mapSubscriptionStatus(
  status: Stripe.Subscription.Status
): "active" | "past_due" | "canceled" | "inactive" {
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

// Shared by created/updated/deleted — only the forced status differs.
// trial_ends_at is overwritten from Stripe's own trial_end (null once
// there's no Stripe-side trial on the subscription, e.g. after it converts
// to a paid period); that's fine even though it erases the signup-based
// value, since "active" alone already grants access in proxy.ts's OR check.
// subscription_tier only has one real value today ('pro') — there's a
// single plan — but the field exists so a future tier doesn't need a
// schema change, just a new mapping here.
function buildSubscriptionFields(subscription: Stripe.Subscription, forcedStatus?: "canceled") {
  return {
    stripe_subscription_id: subscription.id,
    subscription_status: forcedStatus ?? mapSubscriptionStatus(subscription.status),
    trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    subscription_tier:
      (forcedStatus ?? mapSubscriptionStatus(subscription.status)) === "active" ? "pro" : null,
  };
}

// Marks a change order paid, but only after confirming the money actually
// landed on the provider's own connected Stripe account — not just that
// *some* payment succeeded. session.metadata is set by our own server code
// in payChangeOrder (not attacker-controlled), but re-checking it against
// the PaymentIntent's real transfer_data.destination guards against a stale
// or mismatched account id ever getting recorded as a successful payout.
async function markChangeOrderPaid(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
) {
  const changeOrderId = session.metadata?.change_order_id;
  const expectedAccountId = session.metadata?.provider_account_id;
  if (!changeOrderId) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  if (expectedAccountId && paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const actualDestination =
      typeof paymentIntent.transfer_data?.destination === "string"
        ? paymentIntent.transfer_data.destination
        : paymentIntent.transfer_data?.destination?.id;

    if (actualDestination !== expectedAccountId) {
      console.error(
        `Refusing to mark change order ${changeOrderId} paid: payment intent ` +
          `${paymentIntentId} destination "${actualDestination}" does not match ` +
          `expected provider account "${expectedAccountId}"`
      );
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from("change_orders")
    .update({
      status: "paid",
      stripe_payment_intent_id: paymentIntentId ?? null,
      stripe_connected_account_id: expectedAccountId ?? null,
    })
    .eq("id", changeOrderId)
    .eq("status", "approved");

  if (error) {
    console.error("Failed to mark change order as paid:", error.message);
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET environment variable");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Missing stripe-signature header");
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Stripe webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  switch (event.type) {
    // Fired at the end of both kinds of checkout this app creates:
    // subscription (Phase 3 billing) and one-off payment (Phase 5+7 change
    // order payments, now routed as Connect destination charges) — branch
    // on mode since the two need different rows updated.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription") {
        const supabaseUserId = session.client_reference_id;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;

        if (supabaseUserId && customerId) {
          const { error } = await supabaseAdmin
            .from("users")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
            })
            .eq("id", supabaseUserId);

          if (error) {
            console.error("Failed to record checkout completion:", error.message);
          }
        }
      } else if (session.mode === "payment" && session.payment_status === "paid") {
        // payment_status can still be "unpaid" here for delayed-notification
        // payment methods — those complete later via
        // checkout.session.async_payment_succeeded instead.
        await markChangeOrderPaid(session, stripe, supabaseAdmin);
      }
      break;
    }

    // Same "mark paid" outcome as above, but for payment methods that
    // confirm asynchronously (e.g. bank debits) after the Checkout Session
    // already completed with payment_status "unpaid".
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        await markChangeOrderPaid(session, stripe, supabaseAdmin);
      }
      break;
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const changeOrderId = session.metadata?.change_order_id;
      if (changeOrderId) {
        console.error(`Async payment failed for change order ${changeOrderId}`);
      }
      break;
    }

    // Keeps the provider's payment-readiness flags in sync with Stripe as
    // they complete (or lose) Connect onboarding, independent of whatever
    // the settings page last saw. Requires this endpoint to be subscribed to
    // Connect account events in the Stripe Dashboard (or via `stripe listen
    // --forward-connect-to` in dev) — the event carries `account` when it
    // originates from a connected account rather than the platform itself.
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const { error } = await supabaseAdmin
        .from("users")
        .update({
          stripe_connect_charges_enabled: !!account.charges_enabled,
          stripe_connect_payouts_enabled: !!account.payouts_enabled,
        })
        .eq("stripe_account_id", account.id);

      if (error) {
        console.error("Failed to sync Connect account status:", error.message);
      }
      break;
    }

    // Fired on creation, renewals, plan/trial changes, payment failures, and
    // cancellations — keeps subscription_status, trial_ends_at, and
    // subscription_tier authoritative for the life of the plan.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const fields = buildSubscriptionFields(
        subscription,
        event.type === "customer.subscription.deleted" ? "canceled" : undefined
      );

      const { error } = await supabaseAdmin
        .from("users")
        .update(fields)
        .eq("stripe_customer_id", customerId);

      if (error) {
        console.error("Failed to sync subscription status:", error.message);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
