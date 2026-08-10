import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/app/actions/billing";

export default async function BillingRequiredPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, trial_ends_at")
    .eq("id", user!.id)
    .maybeSingle();

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialExpired = !trialEndsAt || trialEndsAt.getTime() < Date.now();
  const status = profile?.subscription_status ?? "inactive";

  const heading =
    status === "past_due"
      ? "Your last payment didn't go through"
      : status === "canceled"
        ? "Your subscription was canceled"
        : trialExpired
          ? "Your free trial has ended"
          : "Subscription required";

  const body =
    status === "past_due"
      ? "Update your payment method to keep sending client portals."
      : "Subscribe to TradeLock Pro ($49/month) to keep creating projects and sending client portals.";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">{heading}</h1>
        <p className="mt-2 text-sm text-gray-900">{body}</p>
        <form action={createCheckoutSession} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            Subscribe — $49/mo
          </button>
        </form>
      </div>
    </div>
  );
}
