-- Enable UUID generator used by default values.
create extension if not exists pgcrypto;

create or replace function public.parse_tags(raw text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(tag), '{}'::text[])
  from (
    select distinct lower(trim(x)) as tag
    from unnest(string_to_array(coalesce(raw, ''), ',')) as x
    where trim(x) <> ''
  ) s;
$$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  platform text not null,
  tags text[] not null default '{}'::text[],
  mood_tags text,
  created_at timestamptz not null default now()
);

alter table public.games
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.games
  add column if not exists mood_tags text;

-- Optional one-time migration for legacy rows.
update public.games
set tags = (
  select coalesce(array_agg(t), '{}'::text[])
  from (
    select distinct lower(trim(x)) as t
    from unnest(string_to_array(coalesce(public.games.mood_tags, ''), ',')) as x
    where trim(x) <> ''
  ) s
)
where coalesce(array_length(tags, 1), 0) = 0
  and coalesce(trim(mood_tags), '') <> '';

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

create or replace function public.recommend_games(
  p_mood_tags text default '',
  p_limit int default 3
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  platform text,
  tags text[],
  created_at timestamptz
)
language sql
stable
as $$
  with mood as (
    select public.parse_tags(p_mood_tags) as tags
  ),
  user_games as (
    select g.id, g.user_id, g.title, g.platform, g.tags, g.created_at
    from public.games g
    where g.user_id = auth.uid()
  ),
  interactions_agg as (
    select
      i.game_id,
      count(*) filter (where i.action = 'like') as like_count,
      count(*) filter (
        where i.action = 'not_now'
          and (
            cardinality(m.tags) = 0
            or public.parse_tags(i.context_tags) && m.tags
          )
      ) as not_now_count,
      max(i.created_at) filter (
        where i.action = 'played'
          and (
            cardinality(m.tags) = 0
            or public.parse_tags(i.context_tags) && m.tags
          )
      ) as last_played_at,
      max(i.created_at) filter (where i.action = 'shown') as last_shown_at,
      bool_or(i.action = 'dont_recommend') as has_dont_recommend
    from public.interactions i
    cross join mood m
    where i.user_id = auth.uid()
    group by i.game_id
  )
  select
    g.id,
    g.user_id,
    g.title,
    g.platform,
    g.tags,
    g.created_at
  from user_games g
  left join interactions_agg ia on ia.game_id = g.id
  cross join mood m
  where coalesce(ia.has_dont_recommend, false) = false
  order by
    (
      coalesce(ia.like_count, 0) * 10
      + (
        case
          when cardinality(m.tags) = 0 then 0
          else coalesce(
            (
              select count(*)::int
              from unnest(g.tags) as gt
              where gt = any(m.tags)
            ),
            0
          ) * 3
        end
      )
      - coalesce(ia.not_now_count, 0) * 2
      - (
        case
          when ia.last_played_at is null then 0
          else greatest(
            0,
            30 - floor(extract(epoch from (now() - ia.last_played_at)) / 86400)::int
          )
        end
      )
    ) desc,
    coalesce(ia.last_shown_at, 'epoch'::timestamptz) asc,
    g.created_at asc
  limit greatest(p_limit, 0);
$$;

alter table public.games enable row level security;
alter table public.interactions enable row level security;

-- games policies
drop policy if exists games_select_own on public.games;
create policy games_select_own
  on public.games
  for select
  using (auth.uid() = user_id);

drop policy if exists games_insert_own on public.games;
create policy games_insert_own
  on public.games
  for insert
  with check (auth.uid() = user_id);

drop policy if exists games_update_own on public.games;
create policy games_update_own
  on public.games
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists games_delete_own on public.games;
create policy games_delete_own
  on public.games
  for delete
  using (auth.uid() = user_id);

-- interactions policies
drop policy if exists interactions_select_own on public.interactions;
create policy interactions_select_own
  on public.interactions
  for select
  using (auth.uid() = user_id);

drop policy if exists interactions_insert_own on public.interactions;
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

drop policy if exists interactions_update_own on public.interactions;
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

drop policy if exists interactions_delete_own on public.interactions;
create policy interactions_delete_own
  on public.interactions
  for delete
  using (auth.uid() = user_id);
