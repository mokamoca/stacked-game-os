-- Enable UUID generator used by default values.
create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  platform text not null,
  mood_tags text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  action text not null check (action in ('like', 'played', 'not_now', 'dont_recommend', 'shown')),
  time_bucket int not null default 30,
  context_tags text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_games_user_id on public.games(user_id);
create index if not exists idx_interactions_user_id on public.interactions(user_id);
create index if not exists idx_interactions_game_id on public.interactions(game_id);
create index if not exists idx_interactions_created_at on public.interactions(created_at desc);

alter table public.games enable row level security;
alter table public.interactions enable row level security;

-- games policies
create policy games_select_own
  on public.games
  for select
  using (auth.uid() = user_id);

create policy games_insert_own
  on public.games
  for insert
  with check (auth.uid() = user_id);

create policy games_update_own
  on public.games
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy games_delete_own
  on public.games
  for delete
  using (auth.uid() = user_id);

-- interactions policies
create policy interactions_select_own
  on public.interactions
  for select
  using (auth.uid() = user_id);

create policy interactions_insert_own
  on public.interactions
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.games g
      where g.id = game_id
        and g.user_id = auth.uid()
    )
  );

create policy interactions_update_own
  on public.interactions
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.games g
      where g.id = game_id
        and g.user_id = auth.uid()
    )
  );

create policy interactions_delete_own
  on public.interactions
  for delete
  using (auth.uid() = user_id);
