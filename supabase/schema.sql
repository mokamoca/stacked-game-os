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
  genre_tags text[] not null default '{}'::text[],
  mood_tags text,
  created_at timestamptz not null default now()
);

alter table public.games
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.games
  add column if not exists mood_tags text;

alter table public.games
  add column if not exists genre_tags text[] not null default '{}'::text[];

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
  game_id uuid references public.games(id) on delete cascade,
  external_source text not null default '',
  external_game_id text not null default '',
  game_title_snapshot text not null default '',
  action text not null check (action in ('like', 'played', 'not_now', 'dont_recommend', 'shown')),
  time_bucket int not null default 30,
  context_tags text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.user_game_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_source text not null default '',
  external_game_id text not null default '',
  game_title_snapshot text not null default '',
  liked boolean not null default false,
  played boolean not null default false,
  disliked boolean not null default false,
  dont_recommend boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_game_states_unique unique (user_id, external_source, external_game_id)
);

alter table public.interactions
  alter column game_id drop not null;

alter table public.interactions
  add column if not exists external_source text not null default '';

alter table public.interactions
  add column if not exists external_game_id text not null default '';

alter table public.interactions
  add column if not exists game_title_snapshot text not null default '';

create index if not exists idx_games_user_id on public.games(user_id);
create index if not exists idx_interactions_user_id on public.interactions(user_id);
create index if not exists idx_interactions_game_id on public.interactions(game_id);
create index if not exists idx_interactions_external_game on public.interactions(user_id, external_source, external_game_id);
create index if not exists idx_interactions_created_at on public.interactions(created_at desc);
create index if not exists idx_user_game_states_user on public.user_game_states(user_id, updated_at desc);

create or replace function public.recommend_games(
  p_mood_tags text default '',
  p_platforms text default '',
  p_genres text default '',
  p_limit int default 3
)
returns table (
  id uuid,
  user_id uuid,
  title text,
  platform text,
  tags text[],
  genre_tags text[],
  created_at timestamptz
)
language sql
stable
as $$
  with mood as (
    select public.parse_tags(p_mood_tags) as tags
  ),
  platforms as (
    select public.parse_tags(p_platforms) as tags
  ),
  genres as (
    select public.parse_tags(p_genres) as tags
  ),
  user_games as (
    select g.id, g.user_id, g.title, g.platform, g.tags, g.genre_tags, g.created_at
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
    g.genre_tags,
    g.created_at
  from user_games g
  left join interactions_agg ia on ia.game_id = g.id
  cross join mood m
  cross join platforms p
  cross join genres ge
  where coalesce(ia.has_dont_recommend, false) = false
    and (
      cardinality(p.tags) = 0
      or public.parse_tags(g.platform) && p.tags
    )
    and (
      cardinality(ge.tags) = 0
      or g.genre_tags && ge.tags
    )
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
alter table public.user_game_states enable row level security;

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
    and (
      (
        game_id is not null
        and exists (
          select 1
          from public.games g
          where g.id = game_id
            and g.user_id = auth.uid()
        )
      )
      or (
        coalesce(trim(external_source), '') <> ''
        and coalesce(trim(external_game_id), '') <> ''
      )
    )
  );

drop policy if exists interactions_update_own on public.interactions;
create policy interactions_update_own
  on public.interactions
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      (
        game_id is not null
        and exists (
          select 1
          from public.games g
          where g.id = game_id
            and g.user_id = auth.uid()
        )
      )
      or (
        coalesce(trim(external_source), '') <> ''
        and coalesce(trim(external_game_id), '') <> ''
      )
    )
  );

drop policy if exists interactions_delete_own on public.interactions;
create policy interactions_delete_own
  on public.interactions
  for delete
  using (auth.uid() = user_id);

-- user_game_states policies
drop policy if exists user_game_states_select_own on public.user_game_states;
create policy user_game_states_select_own
  on public.user_game_states
  for select
  using (auth.uid() = user_id);

drop policy if exists user_game_states_insert_own on public.user_game_states;
create policy user_game_states_insert_own
  on public.user_game_states
  for insert
  with check (
    auth.uid() = user_id
    and coalesce(trim(external_source), '') <> ''
    and coalesce(trim(external_game_id), '') <> ''
  );

drop policy if exists user_game_states_update_own on public.user_game_states;
create policy user_game_states_update_own
  on public.user_game_states
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and coalesce(trim(external_source), '') <> ''
    and coalesce(trim(external_game_id), '') <> ''
  );

drop policy if exists user_game_states_delete_own on public.user_game_states;
create policy user_game_states_delete_own
  on public.user_game_states
  for delete
  using (auth.uid() = user_id);

-- Optional migration: initialize user_game_states from existing interactions.
insert into public.user_game_states (
  user_id,
  external_source,
  external_game_id,
  game_title_snapshot,
  liked,
  played,
  disliked,
  dont_recommend
)
select
  i.user_id,
  i.external_source,
  i.external_game_id,
  max(i.game_title_snapshot) filter (where coalesce(trim(i.game_title_snapshot), '') <> '') as game_title_snapshot,
  bool_or(i.action = 'like') as liked,
  bool_or(i.action = 'played') as played,
  false as disliked,
  bool_or(i.action = 'dont_recommend') as dont_recommend
from public.interactions i
where coalesce(trim(i.external_source), '') <> ''
  and coalesce(trim(i.external_game_id), '') <> ''
group by i.user_id, i.external_source, i.external_game_id
on conflict (user_id, external_source, external_game_id) do update
set
  game_title_snapshot = excluded.game_title_snapshot,
  liked = public.user_game_states.liked or excluded.liked,
  played = public.user_game_states.played or excluded.played,
  dont_recommend = public.user_game_states.dont_recommend or excluded.dont_recommend,
  updated_at = now();
