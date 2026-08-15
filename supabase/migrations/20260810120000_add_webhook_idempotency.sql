-- TradeLock — Stripe webhook idempotency + out-of-order protection.
--
-- Stripe explicitly documents that webhook events can be delivered more
-- than once (retries) and out of order.
--
-- This migration is intentionally safe to run against a database where
-- stripe_webhook_events may already exist.

create table if not exists public.stripe_webhook_events (
  id          text primary key,
  type        text not null,
  endpoint    text not null check (endpoint in ('platform', 'connect')),
  received_at timestamptz not null default now()
);

-- Webhook events are service-role only.
alter table public.stripe_webhook_events enable row level security;

-- Out-of-order protection for subscription status changes.
alter table public.users
  add column if not exists stripe_subscription_event_at timestamptz;

-- Out-of-order protection for Stripe Connect status changes.
alter table public.users
  add column if not exists stripe_connect_event_at timestamptz;