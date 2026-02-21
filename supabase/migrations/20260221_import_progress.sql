create table if not exists public.import_progress (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  scope_key text not null,
  since_year int not null,
  last_page int not null default 1 check (last_page >= 1),
  updated_at timestamptz not null default now(),
  unique (provider, scope_key, since_year)
);

create index if not exists idx_import_progress_provider_scope
  on public.import_progress(provider, scope_key, since_year);
