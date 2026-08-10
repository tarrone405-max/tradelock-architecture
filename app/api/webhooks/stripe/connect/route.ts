import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasProcessedWebhookEvent, markWebhookEventProcessed } from "@/lib/stripeWebhookEvents";

export const runtime = "nodejs";

// Connected-account events only — separate from /api/webhooks/stripe (the
// platform account's own Checkout/subscription events), and verified with
// its own signing secret (STRIPE_CONNECT_WEBHOOK_SECRET). Stripe delivers
// events that happen *on* a connected account (rather than the platform
// account itself) to whichever endpoint the Stripe Dashboard has
// subscribed to "Connect" events; that's a manual Dashboard step, not
// something this code can configure — see AGENTS.md's outstanding items.
//
// This endpoint keeps users.stripe_connect_charges_enabled/payouts_enabled
// in sync independent of the settings page's live accounts.retrieve() call,
// so payment eligibility (checked in payChangeOrder) reflects Stripe's
// state promptly rather than only whenever a provider happens to reload
// /dashboard/settings.

async function handleEvent(event: Stripe.Event, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  switch (event.type) {
    // Fired whenever a connected account's capabilities/requirements change
    // — including right after onboarding finishes. Keeps the two `users`
    // Connect flags authoritative without depending on the settings page
    // being visited.
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const eventCreatedAt = new Date(event.created * 1000).toISOString();

      const { data: currentUser, error: selectError } = await supabaseAdmin
        .from("users")
        .select("id, stripe_connect_event_at")
        .eq("stripe_account_id", account.id)
        .maybeSingle();

      if (selectError) {
        throw new Error(`Failed to look up user for Connect account sync: ${selectError.message}`);
      }

      if (!currentUser) {
        break;
      }

      // Out-of-order guard: a connected account can emit several
      // account.updated events in quick succession during onboarding;
      // don't let a late-arriving stale one flip payment eligibility
      // backwards over a newer one. This is an intentional no-op, not a
      // failure — nothing to retry.
      if (
        currentUser.stripe_connect_event_at &&
        currentUser.stripe_connect_event_at >= eventCreatedAt
      ) {
        console.log(`Skipping stale account.updated event ${event.id} for account ${account.id}`);
        break;
      }

      const { error } = await supabaseAdmin
        .from("users")
        .update({
          stripe_connect_charges_enabled: !!account.charges_enabled,
          stripe_connect_payouts_enabled: !!account.payouts_enabled,
          stripe_connect_event_at: eventCreatedAt,
        })
        .eq("id", currentUser.id);

      if (error) {
        throw new Error(`Failed to sync Connect account status: ${error.message}`);
      }
      break;
    }

    // Fired on the connected account's own event stream when the provider
    // disconnects/revokes TradeLock's access from their Stripe dashboard.
    // event.data.object here is the Application being deauthorized, not the
    // Account — the connected account id instead comes from the top-level
    // event.account field Stripe attaches to every connected-account event.
    case "account.application.deauthorized": {
      const accountId = event.account;
      if (!accountId) break;

      const { error } = await supabaseAdmin
        .from("users")
        .update({
          stripe_connect_charges_enabled: false,
          stripe_connect_payouts_enabled: false,
        })
        .eq("stripe_account_id", accountId);

      if (error) {
        throw new Error(`Failed to record Connect account deauthorization: ${error.message}`);
      }
      break;
    }

    default:
      break;
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Missing STRIPE_CONNECT_WEBHOOK_SECRET environment variable");
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
    console.error(`Stripe Connect webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (await hasProcessedWebhookEvent(supabaseAdmin, event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Only recorded as processed AFTER handleEvent resolves without throwing
  // — see lib/stripeWebhookEvents.ts and the matching comment in
  // app/api/webhooks/stripe/route.ts.
  try {
    await handleEvent(event, supabaseAdmin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `Failed to process Stripe Connect webhook event ${event.id} (${event.type}): ${message}`
    );
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  await markWebhookEventProcessed(supabaseAdmin, event, "connect");
  return NextResponse.json({ received: true });
}
