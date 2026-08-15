import { AlertTriangle, CheckCircle2, CreditCard, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  changeSubscriptionPlan,
  createBillingPortalSession,
  createCheckoutSession,
} from "@/app/actions/billing";
import { GRACE_PERIOD_DAYS, PLANS, PLAN_ORDER, isPlanTier, type Plan, type PlanTier } from "@/lib/plans";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  past_due: "Payment issue",
  canceled: "Canceled",
  inactive: "Not subscribed",
};

// Free → paid is a plain new Checkout Session. Switching between two paid
// plans while already subscribed reuses the *same* Stripe subscription:
// upgrading (a strictly higher-priced plan, e.g. Pro -> Business) goes
// straight through changeSubscriptionPlan (subscriptions.update() on the
// existing item, immediately-invoiced proration), never a second Checkout
// Session — that would create a duplicate subscription. Downgrading or
// canceling still routes to the Billing Portal, where Stripe's hosted UI
// handles proration-credit semantics, which an immediate-invoice upgrade
// flow is the wrong tool for.
function renderPlanAction(tier: PlanTier, currentTier: PlanTier, plan: Plan) {
  if (tier === currentTier) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-900">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Current plan
      </span>
    );
  }

  if (currentTier === "free") {
    return (
      <form action={createCheckoutSession}>
        <input type="hidden" name="tier" value={tier} />
        <button
          type="submit"
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
        >
          Upgrade to {plan.name}
        </button>
      </form>
    );
  }

  const isUpgrade = plan.priceCents > PLANS[currentTier].priceCents;

  if (isUpgrade) {
    return (
      <form action={changeSubscriptionPlan}>
        <input type="hidden" name="tier" value={tier} />
        <button
          type="submit"
          className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
        >
          Upgrade to {plan.name}
        </button>
      </form>
    );
  }

  return (
    <p className="text-xs text-gray-500">
      Use &ldquo;Manage subscription&rdquo; above to {tier === "free" ? "cancel" : `switch to ${plan.name}`}.
    </p>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_tier, subscription_status, subscription_grace_period_started_at, stripe_customer_id"
    )
    .eq("id", user!.id)
    .maybeSingle();

  const currentTier: PlanTier = isPlanTier(profile?.subscription_tier)
    ? profile.subscription_tier
    : "free";
  const status = profile?.subscription_status ?? "inactive";

  const graceDeadline =
    status === "past_due" && profile?.subscription_grace_period_started_at
      ? new Date(
          new Date(profile.subscription_grace_period_started_at).getTime() +
            GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
        )
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Billing</h2>
        <p className="text-sm text-gray-500">Manage your plan and how you&rsquo;re billed.</p>
      </div>

      {checkout === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Subscription updated — thank you!
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <XCircle className="h-4 w-4 shrink-0" />
          Checkout was cancelled. Your plan hasn&rsquo;t changed.
        </div>
      )}

      {status === "past_due" && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Your last payment didn&rsquo;t go through.</p>
            <p className="mt-0.5">
              {graceDeadline
                ? `You'll keep your current plan and benefits until ${graceDeadline.toLocaleDateString()} — update your payment method before then to avoid reverting to the Free plan.`
                : "Update your payment method to avoid reverting to the Free plan."}
            </p>
          </div>
        </div>
      )}

      {status === "canceled" && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900">
          Your paid subscription was canceled — you&rsquo;re on the Free plan.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Current plan</h2>
              <p className="text-xs text-gray-900">
                {PLANS[currentTier].name}
                {currentTier !== "free" && ` — ${STATUS_LABEL[status] ?? status}`}
              </p>
            </div>
          </div>

          {profile?.stripe_customer_id && (
            <form action={createBillingPortalSession}>
              <button
                type="submit"
                className="shrink-0 text-xs font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-700"
              >
                Manage subscription
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const feePct = plan.applicationFeeBps / 100;
          return (
            <div
              key={tier}
              className={`flex flex-col rounded-xl border bg-white p-5 ${
                tier === currentTier ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"
              }`}
            >
              <h3 className="text-sm font-semibold text-gray-900">{plan.name}</h3>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {plan.priceCents === 0 ? "$0" : currency.format(plan.priceCents / 100)}
                <span className="text-sm font-normal text-gray-500">/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-gray-900">
                <li>
                  {feePct === 0 ? "0%" : `${feePct}%`} TradeLock fee on client payments
                </li>
                <li>Full core dashboard access</li>
              </ul>
              <div className="mt-4">{renderPlanAction(tier, currentTier, plan)}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
