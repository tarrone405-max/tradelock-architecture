-- TradeLock — Payment timestamp + reminder tracking on change_orders.
--
-- paid_at: exactly when a change order actually settled (online via
-- Stripe, or offline via cash/check/financed) — distinct from created_at
-- (when the change order was first written up). Needed for an accurate
-- audit-log timeline (Business plan feature, see AuditLogTimeline.tsx) and
-- for revenue-by-month reporting; without it those would have had to
-- misuse created_at as a stand-in for "when paid," which is wrong for any
-- change order that took time to get signed and paid after being created.
--
-- last_reminder_sent_at: when TradeLock's automated payment-due reminder
-- (Pro+ feature, lib/plans.ts's automatedReminders flag) last emailed the
-- client about this change order, so the reminder job never re-sends more
-- than once per day for the same order.
alter table public.change_orders
  add column paid_at timestamptz,
  add column last_reminder_sent_at timestamptz;
