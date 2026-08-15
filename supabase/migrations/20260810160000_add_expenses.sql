-- Expense tracking for Pro and Business plans.
-- Access is enforced at the application layer through planAccess.ts,
-- while RLS ensures providers can only access their own expenses.

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.users(id)
    on delete cascade,

  description text not null,
  amount numeric(12, 2) not null
    check (amount >= 0),

  category text not null default 'other',
  expense_date date not null default current_date,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_id_idx
  on public.expenses(user_id);

create index if not exists expenses_user_date_idx
  on public.expenses(user_id, expense_date desc);

alter table public.expenses enable row level security;

drop policy if exists "Providers can view their own expenses"
  on public.expenses;

create policy "Providers can view their own expenses"
  on public.expenses
  for select
  using (auth.uid() = user_id);

drop policy if exists "Providers can insert their own expenses"
  on public.expenses;

create policy "Providers can insert their own expenses"
  on public.expenses
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Providers can update their own expenses"
  on public.expenses;

create policy "Providers can update their own expenses"
  on public.expenses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Providers can delete their own expenses"
  on public.expenses;

create policy "Providers can delete their own expenses"
  on public.expenses
  for delete
  using (auth.uid() = user_id);

-- Keep updated_at current when an expense is edited.
create or replace function public.set_expenses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_updated_at
  on public.expenses;

create trigger expenses_updated_at
before update on public.expenses
for each row
execute function public.set_expenses_updated_at();