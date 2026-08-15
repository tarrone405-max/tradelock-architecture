-- TradeLock — Normalize users.subscription_tier for the Free/Pro/Business
-- rebuild (Phase 9).
--
-- subscription_tier has been nullable free text with no constraint since
-- 20260809160000_add_trial_and_tier.sql, and until now nothing in the app
-- ever read it — it was write-only. It's about to become financially
-- load-bearing (it determines the Stripe Connect application fee rate on
-- every client payment, see lib/plans.ts + payChangeOrder), so it needs a
-- real constraint before that lands.
--
-- Backfill policy — deliberately NOT a blanket overwrite: a row already
-- sitting at 'pro' reflects a real (if test-mode) active $49/mo Stripe
-- subscription from the prior single-plan implementation. The webhook has
-- always kept subscription_tier and subscription_status in lockstep
-- (tier='pro' only ever got set alongside status='active' — see the old
-- buildSubscriptionFields in app/api/webhooks/stripe/route.ts), so an
-- existing 'pro' row already represents a meaningful, currently-paying
-- subscriber. Forcibly downgrading that row to 'free' here would silently
-- revoke real paid access/0% fee status from someone who is still paying —
-- exactly what "do not blindly overwrite" warns against. Those rows are
-- left as 'pro' and simply carry forward onto the new $29.99 Pro plan
-- (their existing Stripe subscription keeps billing at whatever Price it
-- was created against; only *new* checkouts use the new Price ids).
-- Only NULL/unrecognized values — which never correspond to a real paid
-- subscription — are normalized to 'free', the new default resting state.
update public.users
set subscription_tier = 'free'
where subscription_tier is null
   or subscription_tier not in ('pro', 'business');

alter table public.users
  alter column subscription_tier set default 'free',
  alter column subscription_tier set not null;

alter table public.users
  add constraint users_subscription_tier_check
    check (subscription_tier in ('free', 'pro', 'business'));
