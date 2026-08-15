-- TradeLock — Bug reports and improvement suggestions, from either side of
-- the app (a provider from their dashboard, or a client from their portal),
-- addressed to whoever operates TradeLock — not to each other.
--
-- One-way channel: no select/update/delete policy exists for anyone,
-- authenticated or anon, same "zero policies beyond what's needed" posture
-- as stripe_webhook_events. It's reviewed via the service-role key
-- (Supabase Studio), not surfaced anywhere in the app itself — there's no
-- admin dashboard in this app (a deliberate scope decision, see AGENTS.md),
-- so this deliberately doesn't try to build one just to read this table.
create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  submitted_by  text not null check (submitted_by in ('provider', 'client')),
  user_id       uuid references public.users (id) on delete set null,
  project_id    uuid references public.projects (id) on delete set null,
  feedback_type text not null check (feedback_type in ('bug', 'suggestion')),
  message       text not null check (char_length(message) > 0 and char_length(message) <= 4000),
  contact_email text,
  created_at    timestamptz not null default now(),
  check (
    (submitted_by = 'provider' and user_id is not null and project_id is null)
    or
    (submitted_by = 'client' and project_id is not null and user_id is null)
  )
);

create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Providers submit directly through their own session (RLS-checked), same
-- trust model as messages.sender_type = 'provider'. Client-submitted
-- feedback goes through the service-role client after validating the
-- magic-link token in code (see app/p/[token]/actions.ts) — homeowners
-- aren't Supabase Auth users, so there's no anon policy to write here.
create policy "Providers can submit feedback"
  on public.feedback
  for insert
  to authenticated
  with check (
    submitted_by = 'provider'
    and user_id = auth.uid()
  );
