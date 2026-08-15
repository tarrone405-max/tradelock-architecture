-- TradeLock — Refunds and disputes on change-order payments.
--
-- Refunds: providers can refund a Stripe-paid change order (full or
-- partial) from the dashboard. The refund action itself only calls the
-- Stripe API — like every other Stripe-mutating action in this app, the
-- resulting state is recorded by the webhook (charge.refunded), not by the
-- action, so a refund initiated directly in the Stripe Dashboard is
-- reflected here too, not just ones initiated through TradeLock.
--
-- A full refund flips `status` to 'refunded'. A partial refund leaves
-- `status` at 'paid' — the change order is still considered settled, just
-- with `refunded_amount` (cents, matching application_fee_amount's unit)
-- recording how much came back. Comparing refunded_amount against cost is
-- enough to tell full from partial without a third status value.
--
-- Disputes: a cardholder-initiated chargeback. Tracked as its own axis
-- (stripe_dispute_id/dispute_status/disputed_at), separate from `status`,
-- since a dispute is an overlay on an already-paid order, not a
-- replacement payment-lifecycle state — same reasoning as
-- ExecutionStatusBadge being a separate axis from StatusBadge.
-- dispute_status stores Stripe's own status string (needs_response,
-- under_review, won, lost, etc.) directly rather than a re-mapped
-- TradeLock taxonomy, since Stripe is the single source of truth here.

do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'change_orders'
    and con.contype = 'c'
    and att.attname = 'status';

  if existing_constraint is not null then
    execute format('alter table public.change_orders drop constraint %I', existing_constraint);
  end if;
end $$;

alter table public.change_orders
  add constraint change_orders_status_check
    check (status in ('pending', 'approved', 'declined', 'paid', 'cash', 'check', 'financed', 'refunded'));

alter table public.change_orders
  add column stripe_refund_id text,
  add column refunded_amount integer,
  add column refunded_at timestamptz,
  add column stripe_dispute_id text,
  add column dispute_status text,
  add column disputed_at timestamptz;
