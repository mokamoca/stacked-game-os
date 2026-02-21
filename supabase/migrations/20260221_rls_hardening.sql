-- Enable RLS on all MVP tables.
alter table public.platforms enable row level security;
alter table public.genres enable row level security;
alter table public.games enable row level security;
alter table public.game_platforms enable row level security;
alter table public.game_genres enable row level security;
alter table public.game_external_ids enable row level security;
alter table public.user_filter_state enable row level security;
alter table public.recommendation_events enable row level security;
alter table public.import_progress enable row level security;

-- Public read policies for catalog data only.
drop policy if exists platforms_public_read on public.platforms;
create policy platforms_public_read
  on public.platforms
  for select
  to anon, authenticated
  using (true);

drop policy if exists genres_public_read on public.genres;
create policy genres_public_read
  on public.genres
  for select
  to anon, authenticated
  using (true);

drop policy if exists games_public_read on public.games;
create policy games_public_read
  on public.games
  for select
  to anon, authenticated
  using (true);

drop policy if exists game_platforms_public_read on public.game_platforms;
create policy game_platforms_public_read
  on public.game_platforms
  for select
  to anon, authenticated
  using (true);

drop policy if exists game_genres_public_read on public.game_genres;
create policy game_genres_public_read
  on public.game_genres
  for select
  to anon, authenticated
  using (true);
