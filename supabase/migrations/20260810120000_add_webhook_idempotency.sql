-- TradeLock — Stripe webhook idempotency + out-of-order protection.
--
-- Stripe explicitly documents that webhook events can be delivered more
-- than once (retries) and out of order. `stripe_webhook_events` records
-- every event id we've verified AND FULLY, SUCCESSFULLY processed, keyed by
-- Stripe's own globally-unique event id — a second delivery of the same
-- event hits the primary key and is skipped rather than reapplied. The row
-- is deliberately inserted only after every required write for that event
-- has succeeded (see lib/stripeWebhookEvents.ts) — recording it any earlier
-- would let a mid-handler failure get mistaken for success on Stripe's
-- retry, permanently stranding an incomplete payment/subscription/Connect
-- update.
--
-- Service-role only (webhooks always use getSupabaseAdmin()); RLS is
-- enabled with zero policies so anon/authenticated get a hard default-deny
-- rather than relying on the absence of grants alone.
create table public.stripe_webhook_events (
  id          text primary key,
  type        text not null,
  endpoint    text not null check (endpoint in ('platform', 'connect')),
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- Out-of-order guards: the two webhook handlers that sync a *derived
-- status* (subscription access, Connect payment-readiness) rather than
-- append-only payment facts each get a "last applied event" timestamp.
-- Before writing, the handler compares the incoming event's `created`
-- timestamp against this column and skips if it's not newer — otherwise a
-- late-arriving stale event (e.g. an old "payouts disabled" retried after a
-- newer "payouts enabled" already landed) could silently flip real payment
-- eligibility backwards.
alter table public.users
  add column stripe_subscription_event_at timestamptz,
  add column stripe_connect_event_at timestamptz;
