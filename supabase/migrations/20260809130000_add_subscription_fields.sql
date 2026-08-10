-- TradeLock — Stripe subscription tracking on users (Phase 3)

alter table public.users
  add column stripe_subscription_id text,
  add column subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'active', 'past_due', 'canceled'));

-- Billing fields must only ever be written by trusted server code: the
-- Stripe webhook handler and billing Server Actions both use the
-- service-role client, which bypasses RLS and grants entirely. Without the
-- restriction below, a signed-in provider could self-grant an 'active'
-- subscription_status straight through the anon/authenticated PostgREST
-- API, since the existing "Providers can update own user record" RLS
-- policy (Phase 2) has no column-level restriction — RLS controls which
-- rows are visible/writable, not which columns. Column-level grants close
-- that gap by only ever letting `authenticated` touch company_name.
revoke update on public.users from authenticated;
grant update (company_name) on public.users to authenticated;
