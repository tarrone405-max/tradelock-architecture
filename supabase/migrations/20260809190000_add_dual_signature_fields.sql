-- TradeLock — Dual signature (client + provider countersign) on change orders.
--
-- Existing `signature_data` (canvas image) + `signed_at` stay as-is — this
-- adds the typed-name/timestamp pair for each party on top of that. Client
-- signs first via the portal (sets client_signed_at/client_signature_name
-- alongside the existing signature_data/signed_at); the provider then
-- countersigns from the dashboard once the client's signature is in,
-- setting provider_signed_at/provider_signature_name. The three-state
-- "Pending Client Signature / Pending Provider Review / Fully Executed"
-- view is derived from these two timestamps at read time, not stored.

alter table public.change_orders
  add column provider_signed_at timestamptz,
  add column provider_signature_name text,
  add column client_signed_at timestamptz,
  add column client_signature_name text;
