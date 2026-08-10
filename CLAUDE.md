# TradeLock — Project Guidelines & Architecture
## Tech Stack
- Framework: Next.js (App Router, TypeScript)
- Styling: Tailwind CSS & Lucide Icons
- Database & Auth: Supabase (PostgreSQL, Row Level Security)
- Payments: Stripe (Billing & Checkout)
## Core Architecture Rules
- Use Next.js Server Actions for database mutations.
- Keep components mobile-first and responsive (contractors use this on mobile devices in the field).
- Never store sensitive data or secret keys in client-side components.
- Always validate magic-link tokens (`unique_token`) securely when fetching client portal data.
## Common Commands
- Run dev server: `npm run dev`
- Build project: `npm run build`
## Architectural State & History
_Last updated: after fixing the Stripe Price ID config bug and removing provider-facing ToS editing. This section is rewritten wholesale each time, not appended to — treat it as the current-state snapshot, not a changelog._

### Stack & Core Architecture
- Framework: Next.js App Router + TypeScript, Tailwind CSS v4, Lucide icons.
- Location: `C:\Users\tarro\Documents\TradeALock architecture` (npm package name is `tradelock`, not the folder name — folder has a space/capitals).
- Database/Auth: Supabase (hosted/remote project, ref `lsqospqznysalsayrepb`) — no local Supabase CLI stack; every migration is applied manually by the user pasting SQL into the Supabase Dashboard SQL Editor. `supabase/migrations/*.sql` files are the source of truth Claude writes, but cannot apply them directly (no DB connection string, no persisted CLI auth). Generating `types/supabase.ts` needs a fresh one-off Supabase access token each time (user generates it, pastes it, revokes it after) — there is no standing credential.
- Payments: Stripe — subscription Checkout ($49/mo, platform account) and one-time change-order payment Checkout, one shared webhook endpoint at `/api/webhooks/stripe`. Change-order payments are Stripe Connect **destination charges**: money routes straight to the provider's own connected Express account (`users.stripe_account_id`), not the platform balance, with an optional basis-point platform cut via `STRIPE_APPLICATION_FEE_BPS`.
- Email: Resend + `@react-email/components`, via `lib/resend.ts`. Falls back to `console.log` in dev when `RESEND_API_KEY` is unset (currently unset — emails are not actually sending yet).
- Git: `C:\` is a git repo tracking the whole drive; every commit is scoped to this project's pathspec only (`git add`/`commit -- .` from inside the project dir). No global git author configured — commits use inline `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` env vars.

### Key patterns
- Two Supabase client types, both typed via generated `types/supabase.ts`:
  - `lib/supabase/server.ts` → `createClient()` — session-aware, cookie-based, RLS-respecting. Ordinary provider CRUD (create project, create change order, settings, reading own profile).
  - `lib/supabase/admin.ts` → `getSupabaseAdmin()` — service-role, bypasses RLS. Used for: the client portal (homeowners have no Supabase Auth session, so the token is validated in code instead), billing, offline-payment status changes, countersigning, webhooks. Lazy singleton — `next build` imports route handlers without invoking them, so eager env-var checks at module scope break the build.
  - `lib/stripe.ts` → `getStripe()` — same lazy-singleton reasoning.
- Portal auth pattern: `/p/[token]` and its Server Actions never use the RLS `x-portal-token` header policy Phase 2 originally designed (still in the DB as harmless defense-in-depth) — the app authorizes by looking up the project via `unique_token` through the service-role client and re-scoping every mutation with `.eq("project_id", ...)`.
- `next.config.ts` has `agentRules: false` — stops Next 16's dev server from auto-injecting an "AI agent rules" block into this file on every `npm run dev`. If you ever see a `<!-- BEGIN:nextjs-agent-rules -->` block appear here, it's that (already disabled, but noting the marker in case it resurfaces).
- `proxy.ts` (not `middleware.ts` — Next 16 renamed the convention) does two things: refreshes the session + redirects unauthenticated `/dashboard/*` to `/login`, **and** hard-enforces entitlement — redirects to `/dashboard/billing` if the provider isn't `subscription_status = 'active'` AND their `trial_ends_at` has passed. `/dashboard/billing` itself is exempt. A missing `users` row (brand new account, profile not yet synced) fails *open*, not closed.
- Two entirely separate "Terms of Service" concepts — don't conflate them:
  1. **Platform ToS** (`lib/platformTerms.ts`, `app/terms/page.tsx`, `users.terms_accepted*`) — TradeLock's own terms, fixed version string (`"v1"`), every provider accepts once at signup via a required checkbox.
  2. **Client-facing ToS** (`terms_of_service` table) — the terms shown to a provider's clients in the portal, versioned. No longer provider-editable: the `/dashboard/settings` editing card and its `updateTermsOfService` Server Action were removed (letting contractors author their own unvetted legal text was a liability risk). New versions are now published only via `scripts/publish-terms.mjs` (`npm run publish-terms <provider-email> <path-to-terms.txt>`), run by whoever operates TradeLock using the service-role key — codebase/admin-only, never exposed over HTTP or to a provider's session.
- Dual signature model on change orders: client signs first (canvas + typed legal name, via the portal) → provider countersigns afterward (typed name only, via the dashboard, only unlockable once the client has signed). `ExecutionStatusBadge` (derived, not stored) shows "Pending Client Signature" / "Pending Provider Review" / "Fully Executed" from the two `*_signed_at` timestamps — this is a different axis from the existing payment-status `StatusBadge` (pending/approved/paid/cash/check/financed/declined) and the two badges intentionally coexist.
- Stripe Connect (direct payment routing, Phase 7): `app/actions/connect.ts` handles onboarding (`startStripeConnectOnboarding` — creates an Express account + `accountLinks` and redirects to Stripe-hosted onboarding, reusable to resume an incomplete account), the Express dashboard deep-link (`openStripeExpressDashboard`, via `accounts.createLoginLink`), and `getConnectStatus` (live `accounts.retrieve` call, opportunistically syncs `users.stripe_connect_charges_enabled`/`payouts_enabled`, called from the settings page on every render). `payChangeOrder` (`app/p/[token]/actions.ts`) refuses to create a Checkout Session unless the provider has a `stripe_account_id` with `stripe_connect_charges_enabled = true`, then creates it with `payment_intent_data: { transfer_data: { destination }, application_fee_amount? }` — a destination charge, so the platform Stripe account never touches client funds. The client portal (`app/p/[token]/page.tsx`) hides the Pay button (shows a "contact your contractor directly" message instead) when the provider hasn't finished onboarding, reading `users.stripe_connect_charges_enabled` via the same join as `company_name`. The webhook's `markChangeOrderPaid` helper cross-checks the PaymentIntent's real `transfer_data.destination` against the session metadata before flipping `status` to `paid`, and records `stripe_payment_intent_id`/`stripe_connected_account_id` on the change order; `account.updated` events keep the two `users` Connect flags in sync independent of the settings-page live check, but that requires the webhook endpoint to actually be subscribed to Connect account events in the Stripe Dashboard (not yet done — see outstanding items).

### Database Schema (current live state — all migrations below are applied and confirmed via a full Playwright pass)

**`users`** (1:1 extension of `auth.users`)
`id, company_name, email, stripe_customer_id, created_at, subscription_status (default 'inactive'), stripe_subscription_id, trial_ends_at, subscription_tier, terms_accepted (default false), terms_accepted_at, terms_version, stripe_account_id, stripe_connect_charges_enabled (default false), stripe_connect_payouts_enabled (default false)`
RLS: own-row view/insert/update, but `UPDATE` is column-restricted — `authenticated` can only touch `company_name`; every other field (billing, trial, platform-ToS acceptance, Connect status) is service-role-only writable.

**`projects`**
`id, user_id→users, client_name, client_email, property_address, unique_token (magic link), created_at`
RLS: providers full CRUD on own rows.

**`change_orders`**
`id, project_id→projects, description, cost, status, signature_data, signed_at, created_at, payment_reference, terms_version_id→terms_of_service, terms_accepted_at, due_date, provider_signed_at, provider_signature_name, client_signed_at, client_signature_name, stripe_payment_intent_id, stripe_connected_account_id`
`status ∈ pending | approved | declined | paid | cash | check | financed`
RLS: providers full CRUD via project-ownership join; zero anon/client write grants (portal writes always go through service-role + code checks).

**`terms_of_service`** (client-facing, per-provider, versioned)
`id, user_id→users, version, content, is_active, created_at` — publishing deactivates the old row and inserts a new one, never mutates in place; partial unique index enforces one active version per provider.

**Migrations applied, in order** (all confirmed live):
1. `20260809120000_initial_schema.sql` — base users/projects/change_orders + RLS
2. `20260809130000_add_subscription_fields.sql` — subscription_status/stripe_subscription_id + column-grant lockdown (⚠️ was silently un-applied for most of an earlier session — caught when strict generated types surfaced it as a build error; lesson: don't assume a written migration file means it's live)
3. `20260809140000_add_offline_payment_methods.sql` — cash/check/financed + payment_reference
4. `20260809150000_add_terms_of_service.sql` — client-facing terms_of_service table + change_orders terms columns
5. `20260809160000_add_trial_and_tier.sql` — trial_ends_at + subscription_tier on users
6. `20260809170000_add_change_order_due_date.sql` — due_date on change_orders
7. `20260809180000_add_provider_terms_acceptance.sql` — platform ToS acceptance fields on users
8. `20260809190000_add_dual_signature_fields.sql` — provider/client signature name+timestamp pairs on change_orders
9. `20260809200000_add_stripe_connect.sql` — applied and confirmed live — `stripe_account_id`/`stripe_connect_charges_enabled`/`stripe_connect_payouts_enabled` on users, `stripe_payment_intent_id`/`stripe_connected_account_id` on change_orders

### Completed work (commit status)

| What | Commit |
|---|---|
| Phase 1: CLAUDE.md + Next.js scaffold | `66804ee` |
| Phase 2–3: Supabase schema + Stripe billing ($49/mo checkout, initial webhook) | `6e2d393` |
| Phase 4 + redesign: Supabase Auth, dashboard base, premium UI redesign | `daf17d0` |
| Auth fix: green success message, `/auth/callback` | `eab3329` |
| Phase 5 + sweep + offline payments + client ToS: portal, signature pad, Stripe one-time payment, contrast sweep rounds 1–2, cash/check/financed, editable client-facing ToS | `a539a3d` |
| Types regen, PDF export, contrast round 3 root-cause fix | `4f378c9` |
| Trial/tier tracking, Resend emails, dual signatures, platform ToS acceptance, due dates | `57a4748` |
| Auth redirect fix: use `NEXT_PUBLIC_SITE_URL` instead of a hardcoded host | `bed2fcc` |
| Stripe Connect direct payment routing (destination charges, onboarding flow, webhook verification, portal gating) | `d2b0a95` |
| Stripe Price ID config fix (was a Product ID) + settings-page ToS editing removal + `scripts/publish-terms.mjs` | not committed |

**The contrast issue was a real bug, not just a preference**, resolved: `app/globals.css` had the leftover create-next-app `@media (prefers-color-scheme: dark)` block swapping `--foreground` to near-white, and a couple of `<input>`/`<textarea>` elements had no explicit text-color class, so typed text went invisible-light for any user with OS/browser dark mode on. Fixed both the specific inputs and removed the dark-mode block entirely (this app has no dark-mode design anywhere else). Confirmed via Playwright with forced `colorScheme: "dark"` emulation, not just visual inspection.

### Known outstanding items
- **Provider-facing ToS editing has been removed** (see Key patterns above) — the settings page no longer has a Terms of Service card; `app/(dashboard)/dashboard/settings/actions.ts` was deleted entirely. New client-facing terms versions are published only via `scripts/publish-terms.mjs`.
- **Stripe Connect onboarding is blocked on a real Stripe account step, confirmed via a live Playwright run**: clicking "Connect Stripe account" throws `"Your account must be activated in order to create accounts."` — this is the *platform's own* Stripe account (the one behind `STRIPE_SECRET_KEY`) needing to finish activation/business-profile setup at `https://dashboard.stripe.com/account/onboarding` before it's allowed to create Express connected accounts on behalf of providers. Not a code bug — the onboarding button, `accountLinks` redirect, and DB persistence are all correct as built; nothing else about Connect (destination-charge payment routing, webhook cross-check, portal gating) has been end-to-end tested yet because this step blocks it.
- `account.updated` webhook handling requires manually subscribing this endpoint to Connect events in the Stripe Dashboard (or `stripe listen --forward-connect-to ...` locally) — not yet done, so `stripe_connect_charges_enabled`/`payouts_enabled` currently only ever get refreshed by the settings page's live `accounts.retrieve` call, not push updates. `STRIPE_APPLICATION_FEE_BPS` is unset (0% platform fee) — pricing on the Connect cut hasn't been decided.
- `STRIPE_WEBHOOK_SECRET` is set but has never been exercised against a real `stripe listen` session or a real Stripe event — only the webhook's code path has been verified directly. `STRIPE_PRICE_ID` now points at a real test-mode Price (fixed this session — it previously held a Product ID by mistake, which would have made every subscribe attempt fail); Checkout session creation was confirmed live via Playwright, reaching a real `checkout.stripe.com` page. Stripe CLI is not installed on this machine; needed for `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- `RESEND_API_KEY` is empty — emails currently just log to console instead of sending.
- `app/terms/page.tsx` (platform ToS) content includes indemnification and liability-limitation clauses — **needs real legal review before this is relied on**, it was drafted as a starting point, not vetted by a lawyer.
- Supabase access tokens for type generation are one-off/never persisted by design — expect to need a fresh one each time `types/supabase.ts` needs regenerating after a schema change.
- A full end-to-end Playwright pass (signup ToS gate → project/change-order creation with due date → client sign with 3-way gate → provider countersign → execution badges → PDF dual-signature record) passed completely as of this snapshot. Along the way, hit Supabase Auth's email-sending rate limit on a real signup attempt (external infra limit from cumulative testing, not a bug) and routed around it via the admin API for the rest of the test.