-- TradeLock — Column-level UPDATE grant restriction on organizations
--
-- 20260817120000_add_organizations.sql gave organizations row-level UPDATE
-- policies (owner-only) but never restricted which columns an authenticated
-- session can write, unlike users (20260809130000: "revoke update on users
-- from authenticated; grant update (company_name) on users to authenticated;"
-- specifically to stop a session from self-granting billing/subscription
-- state). organizations copies the exact same class of fields
-- (stripe_customer_id, subscription_status, stripe_subscription_id,
-- subscription_tier, trial_ends_at, stripe_account_id,
-- stripe_connect_charges_enabled, stripe_connect_payouts_enabled) but has no
-- equivalent restriction — an org owner can PATCH their own row today and
-- set subscription_status='active' or stripe_connect_charges_enabled=true
-- directly, bypassing Stripe entirely.
--
-- This migration only narrows an existing over-broad grant (default INSERT/
-- UPDATE privileges from the table owner) down to profile-only columns — it
-- does not touch any RLS policy, and does not remove any capability the app
-- actually uses: no application code updates any organizations column other
-- than these profile fields via the session client (billing/Connect fields
-- are only ever written by the service-role client).

revoke update on public.organizations from authenticated;

grant update (
  name,
  slug,
  business_type,
  logo_url,
  brand_color,
  country,
  timezone
) on public.organizations to authenticated;

-- Explicitly NOT granted (service-role-only, matches users' equivalent
-- lockdown): stripe_customer_id, subscription_status, stripe_subscription_id,
-- subscription_tier, trial_ends_at, stripe_account_id,
-- stripe_connect_charges_enabled, stripe_connect_payouts_enabled, owner_id,
-- id, created_at.
