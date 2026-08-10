"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Starts a Stripe Checkout session for the $49/month TradeLock Pro plan
// and redirects the signed-in provider to it. Billing columns on `users`
// are only ever written through the service-role client — see the
// column-grant restriction in supabase/migrations/*_add_subscription_fields.sql.
export async function createCheckoutSession() {
  if (!process.env.STRIPE_PRICE_ID) {
    throw new Error("Missing STRIPE_PRICE_ID environment variable");
  }

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
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Could not load billing profile: ${profileError.message}`);
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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${siteUrl}/dashboard?checkout=success`,
    cancel_url: `${siteUrl}/dashboard?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}
