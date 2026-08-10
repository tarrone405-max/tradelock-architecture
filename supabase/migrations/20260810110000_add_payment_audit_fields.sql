-- TradeLock — Payment audit trail for online (Stripe Connect) change-order
-- payments. Extends the existing stripe_payment_intent_id/
-- stripe_connected_account_id pair (added with Stripe Connect itself) with
-- the rest of what support/dispute-resolution needs to trace a payment:
-- which Checkout Session it came from, the resulting Charge, what currency
-- it settled in, and how much (if any) platform fee was taken.
--
-- Written only by the webhook handler (service role), never by a provider
-- or client session — see 20260810100000_harden_change_order_rls.sql,
-- which already restricts authenticated UPDATE to description/due_date
-- only, so these new columns are service-role-write-only by construction,
-- no additional grant change needed.

alter table public.change_orders
  add column stripe_checkout_session_id text,
  add column stripe_charge_id text,
  add column currency text,
  add column application_fee_amount integer;
