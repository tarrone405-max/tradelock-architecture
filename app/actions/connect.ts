"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Creates (or resumes) a Stripe Express account for the signed-in provider
// and sends them to Stripe-hosted onboarding. Called both for a brand-new
// account and to finish an incomplete one — accountLinks.create works
// either way as long as `account` already exists.
export async function startStripeConnectOnboarding() {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    throw new Error("You must be signed in to connect a payment account.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Could not load payment profile: ${profileError.message}`);
  }

  let accountId = profile?.stripe_account_id ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { supabase_user_id: user.id },
    });
    accountId = account.id;

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ stripe_account_id: accountId })
      .eq("id", user.id);

    if (updateError) {
      throw new Error(`Could not save Stripe account: ${updateError.message}`);
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/dashboard/settings?connect=refresh`,
    return_url: `${siteUrl}/dashboard/settings?connect=return`,
    type: "account_onboarding",
  });

  redirect(accountLink.url);
}

// Deep-links a fully onboarded provider into their Stripe Express dashboard
// (payouts, statements, bank details) rather than reimplementing any of that.
export async function openStripeExpressDashboard() {
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
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_account_id) {
    throw new Error("No connected Stripe account found.");
  }

  const loginLink = await stripe.accounts.createLoginLink(profile.stripe_account_id);
  redirect(loginLink.url);
}

// Live status, refreshed from Stripe (not just the last-synced DB flags) and
// opportunistically persisted so the rest of the app — the checkout Server
// Action and the client portal — can read a cheap boolean instead of calling
// Stripe on every page view.
export async function getConnectStatus(): Promise<{
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}> {
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
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_account_id) {
    return { accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(profile.stripe_account_id);

  await supabaseAdmin
    .from("users")
    .update({
      stripe_connect_charges_enabled: !!account.charges_enabled,
      stripe_connect_payouts_enabled: !!account.payouts_enabled,
    })
    .eq("id", user.id);

  return {
    accountId: profile.stripe_account_id,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
  };
}
