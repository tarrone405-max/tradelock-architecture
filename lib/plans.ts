import "server-only";

// ============================================================
// TRADELOCK PLAN CONFIGURATION
// ============================================================
//
// Single source of truth for:
// - Plan names
// - Monthly prices
// - Stripe Price environment variables
// - TradeLock application fees
// - Feature entitlements
//
// Plans:
// Free     = $0/month
// Pro      = $29.99/month
// Business = $79.99/month
//
// Free does NOT create a Stripe subscription.
// ============================================================

export type PlanTier = "free" | "pro" | "business";

export interface Plan {
  tier: PlanTier;

  name: string;

  /** Monthly price in cents. */
  priceCents: number;

  /**
   * TradeLock's application fee in basis points.
   *
   * 500 = 5%
   * 0   = no application fee
   */
  applicationFeeBps: number;

  /**
   * Environment variable containing the Stripe recurring
   * Price ID for this plan.
   *
   * Free has no Stripe Price.
   */
  stripePriceEnvVar: string | null;

  /** Features available on this plan. */
  features: {
    dashboardAccess: boolean;

    // Usage
    unlimitedClients: boolean;
    unlimitedProjects: boolean;
    unlimitedChangeOrders: boolean;
    unlimitedPortals: boolean;

    // Payments & financials
    advancedPayments: boolean;
    financialReports: boolean;
    expenseTracking: boolean;
    profitTracking: boolean;

    // Automation
    automatedReminders: boolean;
    recurringBilling: boolean;

    // Documents
    documentLibrary: boolean;
    customTemplates: boolean;

    // Branding
    customBranding: boolean;
    removeTradeLockBranding: boolean;

    // Business / team
    teamMembers: boolean;
    rolesAndPermissions: boolean;
    multipleLocations: boolean;
    teamAssignments: boolean;

    // Advanced business controls
    auditLogs: boolean;
    advancedReporting: boolean;
    dataExports: boolean;

    // White-label
    customClientPortalDomain: boolean;
    customEmailBranding: boolean;
  };
}

// ============================================================
// PLANS
// ============================================================

export const PLANS: Record<PlanTier, Plan> = {
  // ==========================================================
  // FREE
  // ==========================================================

  free: {
    tier: "free",

    name: "Free",

    priceCents: 0,

    // Free providers pay 5% per client payment.
    applicationFeeBps: 500,

    // Free never creates a Stripe subscription.
    stripePriceEnvVar: null,

    features: {
      dashboardAccess: true,

      unlimitedClients: false,
      unlimitedProjects: false,
      unlimitedChangeOrders: false,
      unlimitedPortals: false,

      advancedPayments: false,
      financialReports: false,
      expenseTracking: false,
      profitTracking: false,

      automatedReminders: false,
      recurringBilling: false,

      documentLibrary: false,
      customTemplates: false,

      customBranding: false,
      removeTradeLockBranding: false,

      teamMembers: false,
      rolesAndPermissions: false,
      multipleLocations: false,
      teamAssignments: false,

      auditLogs: false,
      advancedReporting: false,
      dataExports: false,

      customClientPortalDomain: false,
      customEmailBranding: false,
    },
  },

  // ==========================================================
  // PRO
  // ==========================================================

  pro: {
    tier: "pro",

    name: "Pro",

    priceCents: 2999,

    // Pro pays the monthly subscription.
    // No TradeLock application fee on client payments.
    applicationFeeBps: 0,

    stripePriceEnvVar: "STRIPE_PRICE_ID_PRO",

    features: {
      dashboardAccess: true,

      unlimitedClients: true,
      unlimitedProjects: true,
      unlimitedChangeOrders: true,
      unlimitedPortals: true,

      advancedPayments: true,
      financialReports: true,
      expenseTracking: true,
      profitTracking: true,

      automatedReminders: true,
      recurringBilling: true,

      documentLibrary: true,
      customTemplates: true,

      customBranding: true,
      removeTradeLockBranding: true,

      teamMembers: false,
      rolesAndPermissions: false,
      multipleLocations: false,
      teamAssignments: false,

      auditLogs: false,
      advancedReporting: false,
      dataExports: true,

      customClientPortalDomain: false,
      customEmailBranding: true,
    },
  },

  // ==========================================================
  // BUSINESS
  // ==========================================================

  business: {
    tier: "business",

    name: "Business",

    priceCents: 7999,

    // Business pays the monthly subscription.
    // No TradeLock application fee on client payments.
    applicationFeeBps: 0,

    stripePriceEnvVar: "STRIPE_PRICE_ID_BUSINESS",

    features: {
      dashboardAccess: true,

      unlimitedClients: true,
      unlimitedProjects: true,
      unlimitedChangeOrders: true,
      unlimitedPortals: true,

      advancedPayments: true,
      financialReports: true,
      expenseTracking: true,
      profitTracking: true,

      automatedReminders: true,
      recurringBilling: true,

      documentLibrary: true,
      customTemplates: true,

      customBranding: true,
      removeTradeLockBranding: true,

      teamMembers: true,
      rolesAndPermissions: true,
      multipleLocations: true,
      teamAssignments: true,

      auditLogs: true,
      advancedReporting: true,
      dataExports: true,

      customClientPortalDomain: true,
      customEmailBranding: true,
    },
  },
};

// ============================================================
// PLAN ORDER
// ============================================================

export const PLAN_ORDER: PlanTier[] = [
  "free",
  "pro",
  "business",
];

// ============================================================
// GRACE PERIOD
// ============================================================

/**
 * Number of days a paid subscription can remain past_due
 * before TradeLock falls the provider back to Free.
 */
export const GRACE_PERIOD_DAYS = 7;

// ============================================================
// PLAN VALIDATION
// ============================================================

export function isPlanTier(
  value: string | null | undefined
): value is PlanTier {
  return (
    value === "free" ||
    value === "pro" ||
    value === "business"
  );
}

// ============================================================
// GET PLAN
// ============================================================

export function getPlan(
  tier: PlanTier
): Plan {
  return PLANS[tier];
}

// ============================================================
// FEATURE CHECK
// ============================================================

export function planHasFeature(
  tier: PlanTier,
  feature: keyof Plan["features"]
): boolean {
  return PLANS[tier].features[feature];
}

// ============================================================
// APPLICATION FEE
// ============================================================
//
// Returns the TradeLock fee in cents.
//
// Example:
// $1,000 payment = 100000 cents
// Free = 5%
// Fee = 5000 cents = $50
//
// Pro / Business = undefined
// because they pay the monthly subscription instead.
//
// ============================================================

export function getApplicationFeeAmount(
  tier: PlanTier,
  unitAmountCents: number
): number | undefined {
  const plan = PLANS[tier];

  const bps = plan.applicationFeeBps;

  if (
    !Number.isFinite(unitAmountCents) ||
    unitAmountCents <= 0
  ) {
    return undefined;
  }

  if (
    !Number.isFinite(bps) ||
    bps <= 0
  ) {
    return undefined;
  }

  return Math.round(
    (unitAmountCents * bps) / 10000
  );
}

// ============================================================
// GET STRIPE PRICE ID
// ============================================================
//
// Free never calls this function.
//
// We intentionally read the two Stripe Price environment
// variables explicitly so the server-side lookup is completely
// unambiguous.
//
// ============================================================

export function getStripePriceId(
  tier: PlanTier
): string {
  if (tier === "free") {
    throw new Error(
      'Plan "free" does not have a Stripe Price because Free does not use Stripe Billing.'
    );
  }

  if (tier === "pro") {
    const priceId =
      process.env.STRIPE_PRICE_ID_PRO?.trim();

    if (!priceId) {
      throw new Error(
        "Missing STRIPE_PRICE_ID_PRO environment variable"
      );
    }

    return priceId;
  }

  if (tier === "business") {
    const priceId =
      process.env.STRIPE_PRICE_ID_BUSINESS?.trim();

    if (!priceId) {
      throw new Error(
        "Missing STRIPE_PRICE_ID_BUSINESS environment variable"
      );
    }

    return priceId;
  }

  throw new Error(
    `Unsupported plan tier: ${tier}`
  );
}

// ============================================================
// GET TIER FROM STRIPE PRICE ID
// ============================================================
//
// Used by the Stripe webhook.
//
// Stripe tells us which Price was actually purchased,
// and we map that Price back to TradeLock's plan.
//
// ============================================================

export function getTierForStripePriceId(
  priceId: string
): PlanTier | null {
  const normalizedPriceId =
    priceId.trim();

  if (!normalizedPriceId) {
    return null;
  }

  const proPriceId =
    process.env.STRIPE_PRICE_ID_PRO?.trim();

  if (
    proPriceId &&
    normalizedPriceId === proPriceId
  ) {
    return "pro";
  }

  const businessPriceId =
    process.env.STRIPE_PRICE_ID_BUSINESS?.trim();

  if (
    businessPriceId &&
    normalizedPriceId === businessPriceId
  ) {
    return "business";
  }

  return null;
}