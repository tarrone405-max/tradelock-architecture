-- TradeLock — Harden change_orders against direct client-side mutation.
--
-- Every legitimate write to change_orders that isn't a brand-new draft
-- (signing, declining, countersigning, offline payment recording, Stripe
-- settlement) already goes through the service-role client with its own
-- explicit ownership + state checks — see app/p/[token]/actions.ts,
-- app/(dashboard)/dashboard/actions.ts, and app/api/webhooks/stripe/*.
-- The original "Providers can insert/update/delete own change orders" RLS
-- policies from the initial schema are pure row-ownership checks with no
-- column or status restriction, which means an authenticated provider's own
-- session — hitting PostgREST directly, bypassing every Server Action —
-- could otherwise forge status='paid', rewrite cost/signature_data/terms
-- fields, plant fake Stripe IDs, or reassign project_id. That's exactly the
-- "he-said-she-said" risk this app exists to eliminate. This migration
-- closes that gap without touching any of the service-role paths above.

-- INSERT: only the four fields createChangeOrder actually sets. Every other
-- column (status, signatures, terms, Stripe IDs) has a safe default
-- (NULL or 'pending'), so omitting them still works — draft creation is
-- unaffected — but a caller can no longer forge them at insert time.
revoke insert on public.change_orders from authenticated;
grant insert (project_id, description, cost, due_date) on public.change_orders to authenticated;

-- UPDATE: authenticated can touch at most description/due_date, and only
-- while the change order is still an unsigned 'pending' draft — the moment
-- a client signs (status flips to 'approved'), or the order is declined,
-- paid, or settled offline, it becomes read-only outside the service-role
-- workflows. Cost, status, signatures, terms, Stripe IDs, and project_id
-- are never directly writable by a provider's own session, at any status.
drop policy if exists "Providers can update own change orders" on public.change_orders;
create policy "Providers can update own pending change orders"
  on public.change_orders
  for update
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    status = 'pending'
    and exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );

revoke update on public.change_orders from authenticated;
grant update (description, due_date) on public.change_orders to authenticated;

-- DELETE: same reasoning — a provider can discard a draft they created by
-- mistake, but can't erase the record of anything once it's been signed,
-- declined, or settled. Deleting a settled row would destroy exactly the
-- audit trail the app is supposed to guarantee.
drop policy if exists "Providers can delete own change orders" on public.change_orders;
create policy "Providers can delete own pending change orders"
  on public.change_orders
  for delete
  to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from public.projects p
      where p.id = change_orders.project_id
        and p.user_id = auth.uid()
    )
  );
