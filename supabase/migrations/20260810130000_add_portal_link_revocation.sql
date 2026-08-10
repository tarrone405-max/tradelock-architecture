-- TradeLock — Revocable/rotatable client portal links.
--
-- `unique_token` has always been a bearer credential with no way to kill or
-- replace it once a provider has shared /p/<token> — a leaked link stayed
-- valid forever. Two independent operations, both provider-initiated from
-- the project detail page:
--   - Revoke: sets portal_token_revoked_at, killing access via the current
--     token without issuing a replacement (e.g. project is done/cancelled).
--   - Rotate: issues a fresh unique_token (see rotatePortalLink in
--     app/(dashboard)/dashboard/actions.ts) and clears
--     portal_token_revoked_at — invalidates the old URL immediately and
--     reactivates access under the new one. Rotating is how a provider
--     recovers from an accidental/leaked share, not just a revoked one.
--
-- Deliberately backward-compatible: this column defaults to NULL (not
-- revoked) for every existing row, so no existing portal URL stops working
-- as a result of this migration — revocation only ever happens when a
-- provider explicitly takes the action, from this point forward.
alter table public.projects
  add column portal_token_revoked_at timestamptz;

-- No RLS/grant change: `projects` UPDATE already allows a provider full
-- CRUD on their own rows (see initial schema), and unique_token/this new
-- column are both meant to be provider-controlled — unlike change_orders,
-- there's no financial/legal audit trail at risk here, just link liveness.
