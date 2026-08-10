-- TradeLock — Provider (contractor) acceptance of TradeLock's own platform
-- Terms of Service / provider policies at signup.
--
-- Not to be confused with the existing `terms_of_service` table (Phase 7):
-- that's each PROVIDER's own customizable terms shown to THEIR clients in
-- the portal. This is the reverse direction — TradeLock's terms, which
-- every provider must accept to use the platform at all. Single fixed
-- version string (see lib/platformTerms.ts), not user-editable, so a plain
-- column set is enough — no versioned table needed for this one.

alter table public.users
  add column terms_accepted boolean not null default false,
  add column terms_accepted_at timestamptz,
  add column terms_version text;

-- No RLS/grant change needed: the existing insert policy already lets a
-- provider set these on their own row at signup, and the existing update
-- lockdown (only company_name is authenticated-updatable — see
-- 20260809130000_add_subscription_fields.sql) already means these fields
-- can't be self-edited afterward either, same trust boundary as billing
-- fields.
