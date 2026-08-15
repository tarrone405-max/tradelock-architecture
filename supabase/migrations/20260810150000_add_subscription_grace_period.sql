-- TradeLock — 7-day past_due grace period tracking (Phase 9).
--
-- When a paid subscription goes past_due, the provider keeps their current
-- plan/benefits for GRACE_PERIOD_DAYS (lib/plans.ts) before the webhook
-- downgrades them to Free. This timestamp records when that window started
-- so the webhook can tell "just went past_due" apart from "has been
-- past_due for over a week" without needing a scheduled job — every
-- subsequent customer.subscription.* event for that customer re-checks it.
-- Cleared back to null once the subscription recovers or the grace period
-- is spent (downgrade applied), so a later lapse starts a fresh window.
alter table public.users
  add column subscription_grace_period_started_at timestamptz;
