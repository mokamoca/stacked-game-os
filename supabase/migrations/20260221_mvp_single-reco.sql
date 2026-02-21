create extension if not exists pgcrypto;

create table if not exists public.platforms (
  code text primary key,
  label_ja text not null
);

create table if not exists public.genres (
  code text primary key,
  label_ja text not null
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  release_year int,
  cover_url text,
  summary_short text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_platforms (
  game_id uuid not null references public.games(id) on delete cascade,
  platform_code text not null references public.platforms(code),
  primary key (game_id, platform_code)
);

create table if not exists public.game_genres (
  game_id uuid not null references public.games(id) on delete cascade,
  genre_code text not null references public.genres(code),
  primary key (game_id, genre_code)
);

create table if not exists public.game_external_ids (
  game_id uuid not null references public.games(id) on delete cascade,
  provider text not null,
  external_id text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, provider),
  unique (provider, external_id)
);

create table if not exists public.user_filter_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  anon_id text unique,
  era_mode text not null default 'ps4_plus' check (era_mode in ('ps4_plus', 'retro_included')),
  genre_codes text[] null,
  platform_codes text[] null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is not null) <> (anon_id is not null)),
  check (genre_codes is null or cardinality(genre_codes) > 0),
  check (platform_codes is null or cardinality(platform_codes) > 0)
);

create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  anon_id text,
  game_id uuid not null references public.games(id) on delete cascade,
  shown_event_id uuid references public.recommendation_events(id) on delete set null,
  action text not null check (action in ('shown', 'reroll', 'dismiss', 'wishlist', 'played', 'blocked')),
  reason_code text,
  reason_note text,
  why_text varchar(200),
  created_at timestamptz not null default now(),
  check ((user_id is not null) <> (anon_id is not null)),
  check (action <> 'dismiss' or (reason_code is not null and btrim(reason_code) <> ''))
);

create unique index if not exists uq_recommendation_events_shown_user
  on public.recommendation_events(user_id, game_id)
  where action = 'shown' and user_id is not null;

create unique index if not exists uq_recommendation_events_shown_anon
  on public.recommendation_events(anon_id, game_id)
  where action = 'shown' and anon_id is not null;

create index if not exists idx_games_release_year on public.games(release_year);
create index if not exists idx_game_platforms_platform on public.game_platforms(platform_code, game_id);
create index if not exists idx_game_genres_genre on public.game_genres(genre_code, game_id);
create index if not exists idx_recommendation_events_user_created
  on public.recommendation_events(user_id, created_at desc);
create index if not exists idx_recommendation_events_anon_created
  on public.recommendation_events(anon_id, created_at desc);
create index if not exists idx_recommendation_events_user_action
  on public.recommendation_events(user_id, action, created_at desc);
create index if not exists idx_recommendation_events_anon_action
  on public.recommendation_events(anon_id, action, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_filter_state_touch_updated_at on public.user_filter_state;
create trigger user_filter_state_touch_updated_at
before update on public.user_filter_state
for each row execute function public.touch_updated_at();

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
before update on public.games
for each row execute function public.touch_updated_at();

create or replace function public.claim_next_recommendation(
  p_user_id uuid default null,
  p_anon_id text default null,
  p_max_retries int default 8
)
returns table (
  exhausted boolean,
  game_id uuid,
  shown_event_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filter public.user_filter_state%rowtype;
  v_game_id uuid;
  v_shown_event_id uuid;
  v_attempt int := 0;
begin
  if (p_user_id is null and p_anon_id is null) or (p_user_id is not null and p_anon_id is not null) then
    raise exception 'exactly one actor id is required';
  end if;

  if p_user_id is not null then
    insert into public.user_filter_state(user_id, era_mode, genre_codes, platform_codes)
    values (p_user_id, 'ps4_plus', null, null)
    on conflict (user_id) do nothing;

    select *
      into v_filter
      from public.user_filter_state
     where user_id = p_user_id
     for update;
  else
    insert into public.user_filter_state(anon_id, era_mode, genre_codes, platform_codes)
    values (p_anon_id, 'ps4_plus', null, null)
    on conflict (anon_id) do nothing;

    select *
      into v_filter
      from public.user_filter_state
     where anon_id = p_anon_id
     for update;
  end if;

  while v_attempt < greatest(1, p_max_retries) loop
    v_attempt := v_attempt + 1;
    v_game_id := null;
    v_shown_event_id := null;

    select g.id
      into v_game_id
      from public.games g
     where (
        v_filter.era_mode = 'retro_included'
        or (g.release_year is not null and g.release_year >= 2013)
      )
      and (
        v_filter.genre_codes is null
        or exists (
          select 1
            from public.game_genres gg
           where gg.game_id = g.id
             and gg.genre_code = any(v_filter.genre_codes)
        )
      )
      and (
        v_filter.platform_codes is null
        or exists (
          select 1
            from public.game_platforms gp
           where gp.game_id = g.id
             and gp.platform_code = any(v_filter.platform_codes)
        )
      )
      and not exists (
        select 1
          from public.recommendation_events s
         where s.game_id = g.id
           and s.action = 'shown'
           and (
             (p_user_id is not null and s.user_id = p_user_id)
             or (p_anon_id is not null and s.anon_id = p_anon_id)
           )
      )
      and not exists (
        select 1
          from public.recommendation_events b
         where b.game_id = g.id
           and b.action = 'blocked'
           and (
             (p_user_id is not null and b.user_id = p_user_id)
             or (p_anon_id is not null and b.anon_id = p_anon_id)
           )
      )
     order by random()
     limit 1;

    if v_game_id is null then
      exhausted := true;
      game_id := null;
      shown_event_id := null;
      return next;
      return;
    end if;

    begin
      insert into public.recommendation_events(user_id, anon_id, game_id, action)
      values (p_user_id, p_anon_id, v_game_id, 'shown')
      returning id into v_shown_event_id;

      exhausted := false;
      game_id := v_game_id;
      shown_event_id := v_shown_event_id;
      return next;
      return;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  exhausted := true;
  game_id := null;
  shown_event_id := null;
  return next;
end;
$$;

insert into public.platforms (code, label_ja)
values
  ('PS4', 'PS4'),
  ('PS5', 'PS5'),
  ('SWITCH', 'Switch'),
  ('PC', 'PC'),
  ('XBOXONE', 'Xbox One'),
  ('XBOXSERIES', 'Xbox Series X|S'),
  ('IOS', 'iOS'),
  ('ANDROID', 'Android')
on conflict (code) do update
set label_ja = excluded.label_ja;

delete from public.platforms p
where p.code in ('XBOXSX', 'MOBILE')
  and not exists (
    select 1 from public.game_platforms gp
    where gp.platform_code = p.code
  );

insert into public.genres (code, label_ja)
values
  ('action', 'アクション'),
  ('rpg', 'RPG'),
  ('adventure', 'アドベンチャー'),
  ('simulation', 'シミュレーション'),
  ('strategy', 'ストラテジー'),
  ('puzzle', 'パズル'),
  ('shooting', 'シューティング'),
  ('sports', 'スポーツ'),
  ('racing', 'レース'),
  ('sandbox', 'サンドボックス'),
  ('survival', 'サバイバル'),
  ('roguelike', 'ローグライク')
on conflict (code) do update
set label_ja = excluded.label_ja;
