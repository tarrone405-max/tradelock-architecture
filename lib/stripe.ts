import "server-only";
import Stripe from "stripe";

let stripeClient: Stripe | undefined;

// Lazy singleton: constructing eagerly at module scope would throw during
// `next build`'s route-handler analysis (which imports this module without
// ever invoking a request), long before real env vars are loaded.
export function getStripe(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return stripeClient;
}

// Optional platform fee taken out of each direct change-order payment via
// Stripe Connect's `application_fee_amount`, expressed in basis points
// (e.g. "250" = 2.5%) through STRIPE_APPLICATION_FEE_BPS. Unset/0 means the
// provider keeps 100% of the charge — that's the default until pricing is
// decided.
export function getApplicationFeeAmount(unitAmountCents: number): number | undefined {
  const bps = Number(process.env.STRIPE_APPLICATION_FEE_BPS ?? "0");
  if (!bps || bps <= 0) return undefined;
  return Math.round((unitAmountCents * bps) / 10000);
}
