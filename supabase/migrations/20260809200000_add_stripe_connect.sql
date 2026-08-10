-- TradeLock — Stripe Connect direct payment routing (Phase 7)
-- Lets each provider connect a Stripe Express account so client payments on
-- change orders route straight to them (destination charge) instead of
-- landing in the platform's own Stripe balance.

alter table public.users
  add column stripe_account_id text unique,
  add column stripe_connect_charges_enabled boolean not null default false,
  add column stripe_connect_payouts_enabled boolean not null default false;

-- No RLS/grant change needed: the existing column-level grant from
-- 20260809130000_add_subscription_fields.sql already restricts
-- `authenticated` UPDATE to company_name only, so these new columns are
-- service-role-write-only by default, same as the other billing fields.

-- Records which connected account a paid change order's funds actually went
-- to, and the PaymentIntent id, for support/audit purposes. Written only by
-- the webhook handler (service role) after Stripe confirms payment.
alter table public.change_orders
  add column stripe_payment_intent_id text,
  add column stripe_connected_account_id text;
