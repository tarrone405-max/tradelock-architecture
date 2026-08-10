-- TradeLock — Offline/alternative payment methods (Phase 6)
-- Extends change_orders.status with 'cash', 'check', 'financed' alongside
-- the existing online-payment states, and adds a free-text field for a
-- lender name / check number / reference note.
--
-- There is deliberately no separate `projects` status column: project-level
-- status shown in the UI is (and stays) derived from its change orders'
-- statuses at read time, so there's a single source of truth instead of two
-- fields that could drift out of sync.

-- The original check constraint's name depends on how it was declared, so
-- find it by introspection rather than assuming
-- "change_orders_status_check" is exactly right.
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
    check (status in ('pending', 'approved', 'declined', 'paid', 'cash', 'check', 'financed'));

alter table public.change_orders
  add column payment_reference text;
