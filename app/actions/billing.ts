"use server";

import { redirect } from "next/navigation";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isPlanTier,
  getStripePriceId,
  getTierForStripePriceId,
  PLANS,
  type PlanTier,
} from "@/lib/plans";

// Starts a Stripe Checkout session for the selected paid plan (Pro or
// Business) and redirects the signed-in provider to it. Free never reaches
// Stripe at all — it's the DB default, not a subscription. Billing columns
// on `users` are only ever written through the service-role client — see
// the column-grant restriction in supabase/migrations/*_add_subscription_fields.sql.
export async function createCheckoutSession(formData: FormData) {
  const tierInput = String(formData.get("tier") ?? "");
  if (!isPlanTier(tierInput) || tierInput === "free") {
    throw new Error("Invalid plan selected.");
  }
  const tier: PlanTier = tierInput;

  const priceId = getStripePriceId(tier);

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("You must be signed in to subscribe.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Could not load billing profile: ${profileError.message}`);
  }

  // Guard against duplicate subscriptions. The UI only ever renders this
  // action's form for a Free user, but that's not a security boundary — a
  // Server Action is a directly-callable endpoint, so this checks Stripe's
  // own live subscription status (not just the cached DB status, which
  // could be momentarily stale) before ever creating a new Checkout
  // Session. Tolerates a subscription id that no longer resolves in Stripe
  // (e.g. stale test-mode data) by falling through and letting them
  // subscribe fresh, rather than hard-failing.
  if (profile?.stripe_subscription_id) {
    let existingSubscription: Stripe.Subscription | null = null;
    try {
      existingSubscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeError)) {
        throw err;
      }
      console.error(
        `Could not verify existing subscription ${profile.stripe_subscription_id}:`,
        err.message
      );
    }

    if (
      existingSubscription &&
      existingSubscription.status !== "canceled" &&
      existingSubscription.status !== "incomplete_expired"
    ) {
      throw new Error(
        'You already have a subscription — use the plan cards or "Manage subscription" to switch plans instead.'
      );
    }
  }

  let customerId: string | null = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);

    if (updateError) {
      throw new Error(`Could not save Stripe customer: ${updateError.message}`);
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Idempotency key scoped to a short time window: a double-submit (double
  // click, browser back/retry) within the window replays Stripe's cached
  // response instead of creating a second Checkout Session; a genuine later
  // attempt gets a fresh key and proceeds normally.
  const idempotencyKey = `checkout-${user.id}-${tier}-${Math.floor(Date.now() / 5000)}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],

      // Checkout Session metadata.
      // Used by checkout.session.completed.
      metadata: {
        plan_tier: tier,
        supabase_user_id: user.id,
      },

      // IMPORTANT:
      // This metadata is copied onto the actual Stripe Subscription.
      // That allows customer.subscription.* webhooks to identify the
      // TradeLock user even if they arrive before checkout.session.completed.
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_tier: tier,
        },
      },

      success_url: `${siteUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${siteUrl}/dashboard/billing?checkout=cancelled`,
    },
    { idempotencyKey }
  );

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}

// Deep-links an existing Stripe customer into the Stripe-hosted Billing
// Portal for anything beyond "subscribe to a plan you don't have yet":
// switching between Pro/Business, updating a payment method during a
// past_due grace period, or canceling. Deliberately not reimplemented as a
// custom flow — re-running createCheckoutSession for a customer who already
// has an active subscription would create a *second*, separate subscription
// rather than change the existing one. Requires a Billing Portal
// configuration to exist in the Stripe Dashboard (a one-time manual step,
// same category of prerequisite as Connect's platform-account activation).
export async function createBillingPortalSession() {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    throw new Error("No billing account yet — subscribe to a paid plan first.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let portalSession: Stripe.BillingPortal.Session;
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/dashboard/billing`,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("Stripe Billing Portal session failed:", err.message);
      throw new Error(
        "Billing management isn't available yet — please contact support."
      );
    }
    throw err;
  }

  redirect(portalSession.url);
}

// Upgrades an existing paid subscription in place (e.g. Pro -> Business) by
// changing the subscription item's Price, instead of starting a new Checkout
// Session — reusing createCheckoutSession for an already-subscribed
// customer would create a *second*, separate subscription rather than
// change the current one.
//
// Stripe's recommended API for this is subscriptions.update() with the
// existing item's id paired with the new price:
// https://stripe.com/docs/billing/subscriptions/upgrade-downgrade
//
// proration_behavior: "always_invoice" immediately generates and charges a
// prorated invoice for the difference, rather than waiting for the next
// renewal — the standard pattern for a same-cycle upgrade. Paired with
// payment_behavior: "error_if_incomplete", a declined card makes this call
// throw instead of leaving the subscription in an "incomplete" state that
// would need a client-side Stripe.js confirmation step this app doesn't
// have — nothing changes on Stripe's side if payment fails.
//
// This function never writes subscription_tier/subscription_status to
// Supabase itself — the existing customer.subscription.updated webhook
// handler (unchanged) already resolves the tier from the subscription's
// real Price id and syncs it moments after this call succeeds, exactly the
// same way it does for every other subscription change.
export async function changeSubscriptionPlan(formData: FormData) {
  const tierInput = String(formData.get("tier") ?? "");
  if (!isPlanTier(tierInput) || tierInput === "free") {
    throw new Error("Invalid plan selected.");
  }
  const targetTier: PlanTier = tierInput;
  const targetPriceId = getStripePriceId(targetTier);

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Could not load billing profile: ${profileError.message}`);
  }

  if (!profile?.stripe_subscription_id) {
    throw new Error("You don't have an active subscription yet — subscribe to a paid plan first.");
  }

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error(`Could not retrieve subscription ${profile.stripe_subscription_id}:`, err.message);
      throw new Error("Could not find your subscription — please refresh and try again.");
    }
    throw err;
  }

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error(
      subscription.status === "canceled" || subscription.status === "incomplete_expired"
        ? "Your subscription isn't active anymore — subscribe again from the plan cards."
        : 'Your subscription has a payment issue — use "Manage subscription" to fix it first.'
    );
  }

  // A TradeLock subscription is always created with exactly one item (see
  // createCheckoutSession) — refuse rather than assume item[0] is "the"
  // plan if that's ever not true (e.g. a second item added manually in the
  // Stripe Dashboard), instead of silently updating the wrong item or
  // leaving a stray one unaccounted for.
  if (subscription.items.data.length !== 1) {
    console.error(
      `Subscription ${subscription.id} has ${subscription.items.data.length} items; expected exactly 1.`
    );
    throw new Error("Your subscription is in an unexpected state — please contact support.");
  }

  const currentItem = subscription.items.data[0];
  if (!currentItem.price?.id) {
    throw new Error("Could not find your subscription's current plan.");
  }

  // Derived from the subscription's real Price, not the (possibly
  // momentarily stale) subscription_tier cached in Supabase — this is a
  // financial decision, so it uses Stripe's own live state as the source of
  // truth, same principle the webhook already follows.
  const liveCurrentTier = getTierForStripePriceId(currentItem.price.id);
  const currentPriceCents = liveCurrentTier ? PLANS[liveCurrentTier].priceCents : 0;

  if (liveCurrentTier === targetTier) {
    redirect("/dashboard/billing");
  }

  if (PLANS[targetTier].priceCents <= currentPriceCents) {
    // Downgrades go through the Billing Portal instead — Stripe's hosted UI
    // there handles proration-credit semantics, which is the opposite of
    // what an immediately-invoiced upgrade should do.
    throw new Error(`To switch to ${PLANS[targetTier].name}, use "Manage subscription" instead.`);
  }

  // Idempotency key scoped to this exact upgrade (subscription + source
  // price + target price) within a short time window — a double-click
  // replays Stripe's cached response instead of generating a second
  // prorated invoice and double-charging the customer for the same
  // upgrade; a genuine later upgrade attempt gets a fresh key.
  const idempotencyKey = `sub-upgrade-${profile.stripe_subscription_id}-${currentItem.price.id}-${targetPriceId}-${Math.floor(Date.now() / 5000)}`;

  try {
    await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      {
        items: [{ id: currentItem.id, price: targetPriceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        // Explicit, not just relying on the current default: the existing
        // billing cycle/renewal date must be preserved, never reset to now.
        billing_cycle_anchor: "unchanged",
      },
      { idempotencyKey }
    );
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("Stripe subscription upgrade failed:", err.message);
      throw new Error(`Could not upgrade to ${PLANS[targetTier].name}: ${err.message}`);
    }
    throw err;
  }

  redirect("/dashboard/billing?checkout=success");
}
