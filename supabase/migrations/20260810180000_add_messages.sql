-- TradeLock — In-app messaging between a provider and their client, scoped
-- to a project (not per change-order — a single running conversation per
-- client relationship, matching how the portal itself is project-scoped).
--
-- Immutable log, not an editable chat: no UPDATE/DELETE policy exists for
-- either side on purpose — "keeping a record of conversations" is the
-- whole point, so a message can be sent but never quietly altered or
-- erased afterward.
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sender_type text not null check (sender_type in ('provider', 'client')),
  body       text not null check (char_length(body) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index messages_project_id_idx on public.messages (project_id, created_at);

alter table public.messages enable row level security;

create policy "Providers can view messages on own projects"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = messages.project_id
        and p.user_id = auth.uid()
    )
  );

create policy "Providers can send messages on own projects"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_type = 'provider'
    and exists (
      select 1 from public.projects p
      where p.id = messages.project_id
        and p.user_id = auth.uid()
    )
  );

-- No anon/client policy: homeowners aren't Supabase Auth users, so — same
-- as every other portal write in this app — client-sent messages go
-- through the service-role client after validating the magic-link token in
-- code (see app/p/[token]/actions.ts), not through RLS.
