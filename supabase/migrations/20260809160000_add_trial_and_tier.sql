-- TradeLock — Trial tracking and subscription tier (Phase 4)
--
-- trial_ends_at is set once at signup (the existing 14-day soft trial the
-- dashboard already showed a countdown for, now made real/stored instead of
-- computed ad hoc in JS from created_at) and can later be overwritten by the
-- Stripe webhook if a subscription carries its own trial_end.
--
-- subscription_tier is nullable text rather than an enum: there's only one
-- paid plan today ('pro'), but this avoids a schema change the moment a
-- second tier exists.

alter table public.users
  add column trial_ends_at timestamptz,
  add column subscription_tier text;

-- Backfill existing rows so accounts created before this migration still
-- get a sensible trial window instead of NULL (= "no trial, no access").
update public.users
set trial_ends_at = created_at + interval '14 days'
where trial_ends_at is null;
