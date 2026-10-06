create table if not exists public.studbud_user_data (
    user_id uuid primary key references auth.users (id) on delete cascade,
    data jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.studbud_user_data enable row level security;
revoke all on table public.studbud_user_data from anon, authenticated;
grant select, insert, update on table public.studbud_user_data to authenticated;

drop policy if exists "Users can read their own StudBud data" on public.studbud_user_data;
create policy "Users can read their own StudBud data"
    on public.studbud_user_data for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert their own StudBud data" on public.studbud_user_data;
create policy "Users can insert their own StudBud data"
    on public.studbud_user_data for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their own StudBud data" on public.studbud_user_data;
create policy "Users can update their own StudBud data"
    on public.studbud_user_data for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
