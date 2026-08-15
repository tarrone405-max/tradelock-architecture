-- TradeLock — Client reviews of a provider, one per project.
--
-- Client-only, after at least one paid change order — a client can only
-- leave one review per project (unique constraint), submitted through the
-- portal (service-role + token validation, same trust model as every other
-- portal write). No provider-reviews-client half: that only makes sense in
-- a marketplace where a client's reputation follows them to other
-- providers, which isn't this app's model — a provider already knows their
-- own client directly, they don't need a rating system to decide whether
-- to work with them again.
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade unique,
  user_id    uuid not null references public.users (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

create index reviews_user_id_idx on public.reviews (user_id);

alter table public.reviews enable row level security;

create policy "Providers can view reviews on own projects"
  on public.reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated/anon: a review is a
-- client action, submitted via the service-role client after validating
-- the magic-link token in code (see app/p/[token]/actions.ts), and is
-- never editable by anyone afterward once left.
