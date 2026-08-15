"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Shared by every Stripe-Connect-triggering action on the settings page —
// these return an error instead of throwing, since a thrown Error from an
// action bound to a <form action={...}> has no error boundary in Next.js
// and takes down the whole page instead of showing an inline message.
export type ConnectActionState = { error: string | null };

export async function startStripeConnectOnboarding(
  _prevState: ConnectActionState,
  _formData: FormData
): Promise<ConnectActionState> {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return {
      error: "You must be signed in to connect a payment account.",
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return {
      error: `Could not load payment profile: ${profileError.message}`,
    };
  }

  let accountId = profile?.stripe_account_id ?? null;

  /*
   * ------------------------------------------------------------
   * CREATE THE CONNECTED ACCOUNT
   * ------------------------------------------------------------
   *
   * TradeLock needs TWO configurations:
   *
   * merchant
   *   - allows the provider to accept card payments
   *
   * recipient
   *   - allows the provider to receive transfers from TradeLock
   *
   * The recipient configuration is required for our destination
   * charge flow.
   */
  let accountLinkUrl: string;

  try {
    if (!accountId) {
      const account = await stripe.v2.core.accounts.create({
        display_name: "TradeLock Provider",
        contact_email: user.email,

        identity: {
          country: "us",
        },

        dashboard: "express",

        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },

        configuration: {
          merchant: {
            capabilities: {
              card_payments: {
                requested: true,
              },
            },
          },

          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: {
                  requested: true,
                },
              },
            },
          },
        },

        metadata: {
          supabase_user_id: user.id,
        },

        include: [
          "configuration.merchant",
          "configuration.recipient",
          "identity",
          "requirements",
        ],
      });

      accountId = account.id;

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          stripe_account_id: accountId,
        })
        .eq("id", user.id);

      if (updateError) {
        return {
          error: `Could not save Stripe account: ${updateError.message}`,
        };
      }
    }

    /*
     * ------------------------------------------------------------
     * IMPORTANT FOR EXISTING ACCOUNTS
     * ------------------------------------------------------------
     *
     * Your current Stripe account was created BEFORE we added the
     * recipient configuration.
     *
     * Therefore, simply sending the provider through onboarding
     * again does NOT automatically fix the account.
     *
     * We explicitly add/request the recipient transfer capability
     * here.
     */
    await stripe.v2.core.accounts.update(accountId, {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },

      include: [
        "configuration.merchant",
        "configuration.recipient",
        "identity",
        "requirements",
      ],
    });

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    /*
     * Send the provider through Stripe onboarding for BOTH
     * merchant and recipient configuration.
     */
    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,

      use_case: {
        type: "account_onboarding",

        account_onboarding: {
          configurations: [
            "merchant",
            "recipient",
          ],

          refresh_url:
            `${siteUrl}/dashboard/settings?connect=refresh`,

          return_url:
            `${siteUrl}/dashboard/settings?connect=return`,
        },
      },
    });

    accountLinkUrl = accountLink.url;
  } catch (error) {
    console.error("Stripe Connect onboarding failed:", error);

    return {
      error:
        "Stripe couldn't start onboarding for this account. Please try again.",
    };
  }

  redirect(accountLinkUrl);
}


/*
 * --------------------------------------------------------------
 * OPEN STRIPE EXPRESS DASHBOARD
 * --------------------------------------------------------------
 */
export async function openStripeExpressDashboard(
  _prevState: ConnectActionState,
  _formData: FormData
): Promise<ConnectActionState> {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in." };
  }

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_account_id) {
    return { error: "No connected Stripe account found." };
  }

  let loginLinkUrl: string;

  try {
    const loginLink = await stripe.accounts.createLoginLink(
      profile.stripe_account_id
    );
    loginLinkUrl = loginLink.url;
  } catch (error) {
    console.error("Failed to create Stripe Express dashboard link:", error);
    return {
      error: "Could not open your Stripe dashboard. Please try again.",
    };
  }

  redirect(loginLinkUrl);
}


/*
 * --------------------------------------------------------------
 * GET CURRENT STRIPE CONNECT STATUS
 * --------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * chargesEnabled:
 *   merchant.card_payments
 *
 * payoutsEnabled:
 *   merchant.stripe_balance.payouts
 *
 * transfersEnabled:
 *   recipient.stripe_balance.stripe_transfers
 *
 * A provider is NOT considered fully ready until BOTH:
 *
 *   card payments = active
 *   transfers     = active
 */
export async function getConnectStatus(): Promise<{
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersEnabled: boolean;
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
    return {
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      transfersEnabled: false,
      detailsSubmitted: false,
    };
  }

  const stripe = getStripe();

  const account =
    await stripe.v2.core.accounts.retrieve(
      profile.stripe_account_id,
      {
        include: [
          "configuration.merchant",
          "configuration.recipient",
          "requirements",
        ],
      }
    );

  /*
   * ------------------------------------------------------------
   * CARD PAYMENTS
   * ------------------------------------------------------------
   */
  const chargesEnabled =
    account.configuration?.merchant
      ?.capabilities?.card_payments
      ?.status === "active";

  /*
   * ------------------------------------------------------------
   * BANK PAYOUTS
   * ------------------------------------------------------------
   */
  const payoutsEnabled =
    account.configuration?.merchant
      ?.capabilities?.stripe_balance
      ?.payouts
      ?.status === "active";

  /*
   * ------------------------------------------------------------
   * DESTINATION TRANSFERS
   * ------------------------------------------------------------
   *
   * THIS is the capability our payment flow was missing.
   */
  const transfersEnabled =
    account.configuration?.recipient
      ?.capabilities?.stripe_balance
      ?.stripe_transfers
      ?.status === "active";

  /*
   * ------------------------------------------------------------
   * REQUIREMENTS
   * ------------------------------------------------------------
   */
  const detailsSubmitted =
    account.requirements?.summary
      ?.minimum_deadline?.status !== "past_due";

  /*
   * Keep TradeLock's cached status synchronized with Stripe.
   */
  await supabaseAdmin
    .from("users")
    .update({
      stripe_connect_charges_enabled:
        chargesEnabled,

      stripe_connect_payouts_enabled:
        payoutsEnabled,
    })
    .eq("id", user.id);

  /*
   * Debug information.
   *
   * This will appear in the Next.js terminal and will let us
   * see exactly what Stripe says about the account.
   */
  console.log(
    "========== TRADELOCK STRIPE STATUS =========="
  );

  console.log(
    "Stripe account:",
    profile.stripe_account_id
  );

  console.log(
    "Card payments:",
    account.configuration?.merchant
      ?.capabilities?.card_payments?.status
  );

  console.log(
    "Bank payouts:",
    account.configuration?.merchant
      ?.capabilities?.stripe_balance
      ?.payouts?.status
  );

  console.log(
    "Transfers:",
    account.configuration?.recipient
      ?.capabilities?.stripe_balance
      ?.stripe_transfers?.status
  );

  console.log(
    "Transfer status details:",
    account.configuration?.recipient
      ?.capabilities?.stripe_balance
      ?.stripe_transfers?.status_details
  );

  console.log(
    "Requirements:",
    account.requirements?.summary
      ?.minimum_deadline?.status
  );

  console.log(
    "Applied configurations:",
    account.applied_configurations
  );

  console.log(
    "=============================================="
  );

  return {
    accountId: profile.stripe_account_id,

    chargesEnabled,

    payoutsEnabled,

    transfersEnabled,

    detailsSubmitted,
  };
}