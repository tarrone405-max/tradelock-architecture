import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getPlan,
  isPlanTier,
  planHasFeature,
  type PlanTier,
  type Plan,
} from "@/lib/plans";

export type PlanFeature = keyof Plan["features"];

/**
 * Gets the provider's current subscription tier from the database.
 *
 * The database is the source of truth for the provider's current plan.
 * Invalid or missing values safely fall back to Free.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if (error) {
    throw new Error(`Could not load subscription plan: ${error.message}`);
  }

  const tier: PlanTier = isPlanTier(data.subscription_tier)
    ? data.subscription_tier
    : "free";

  return getPlan(tier);
}

/**
 * Gets the provider's current plan tier.
 */
export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  const plan = await getUserPlan(userId);
  return plan.tier;
}

/**
 * Checks whether a provider's current plan includes a feature.
 */
export async function userHasFeature(
  userId: string,
  feature: PlanFeature
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return planHasFeature(plan.tier, feature);
}

/**
 * Server-side enforcement for protected actions.
 *
 * Never rely on the UI hiding a feature. Every important mutation should
 * enforce its entitlement on the server as well.
 */
export async function requireFeature(
  userId: string,
  feature: PlanFeature
): Promise<Plan> {
  const plan = await getUserPlan(userId);

  if (!planHasFeature(plan.tier, feature)) {
    throw new Error(
      `This feature requires a higher TradeLock plan.`
    );
  }

  return plan;
}