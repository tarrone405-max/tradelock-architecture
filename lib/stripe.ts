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
