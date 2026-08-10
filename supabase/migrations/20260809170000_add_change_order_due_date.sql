-- TradeLock — Optional payment due date on change orders.

alter table public.change_orders
  add column due_date date;
