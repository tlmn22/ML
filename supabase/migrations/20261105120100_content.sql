-- ML Mongolia — content: heroes, hero statistics, news CMS, favorite heroes.

-- ---------------------------------------------------------------------------
-- heroes / hero_statistics — written only by the server hero sync
-- ---------------------------------------------------------------------------

create table public.heroes (
  id integer primary key, -- provider hero_id
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  head_image_url text,
  roles text[] not null default '{}',
  lanes text[] not null default '{}',
  relations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.hero_statistics (
  id bigint generated always as identity primary key,
  hero_id integer not null references public.heroes (id) on delete cascade,
  rank_bracket text not null,
  window_days smallint not null check (window_days > 0),
  win_rate numeric(7, 6) check (win_rate between 0 and 1),
  pick_rate numeric(7, 6) check (pick_rate between 0 and 1),
  ban_rate numeric(7, 6) check (ban_rate between 0 and 1),
  game_version text,
  captured_at timestamptz not null default now(),
  unique (hero_id, rank_bracket, window_days, captured_at)
);

create index hero_statistics_latest_idx
  on public.hero_statistics (rank_bracket, window_days, captured_at desc);

alter table public.heroes enable row level security;
alter table public.hero_statistics enable row level security;

create policy heroes_select_all on public.heroes for select using (true);
create policy hero_statistics_select_all on public.hero_statistics for select using (true);

revoke insert, update, delete on public.heroes, public.hero_statistics from anon, authenticated;

-- ---------------------------------------------------------------------------
-- News CMS
-- ---------------------------------------------------------------------------

create table public.article_categories (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_mn text not null,
  name_en text not null,
  sort_order smallint not null default 0
);

insert into public.article_categories (slug, name_mn, name_en, sort_order) values
  ('mlbb-news', 'MLBB мэдээ', 'MLBB News', 10),
  ('patch-notes', 'Patch тэмдэглэл', 'Patch Notes', 20),
  ('hero-guides', 'Hero заавар', 'Hero Guides', 30),
  ('hero-builds', 'Hero build', 'Hero Builds', 40),
  ('esports', 'eSports', 'eSports', 50),
  ('mongolia-community', 'Монголын MLBB нийгэмлэг', 'Mongolia MLBB Community', 60),
  ('events', 'Арга хэмжээ', 'Events', 70),
  ('entertainment', 'Энтертайнмент', 'Entertainment', 80);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  title text not null check (char_length(title) between 3 and 200),
  excerpt text check (char_length(excerpt) <= 400),
  content jsonb not null default '{}'::jsonb,
  cover_image_url text,
  category_id smallint not null references public.article_categories (id),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_published_has_date check (status <> 'published' or published_at is not null)
);

create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

create index articles_published_idx on public.articles (published_at desc) where status = 'published';
create index articles_category_idx on public.articles (category_id, published_at desc);
create index articles_search_idx on public.articles using gin (search);

alter table public.article_categories enable row level security;
alter table public.articles enable row level security;

create policy article_categories_select_all on public.article_categories for select using (true);
create policy article_categories_admin_write on public.article_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy articles_select_published on public.articles
  for select using (
    (status = 'published' and published_at <= now()) or public.is_admin()
  );
create policy articles_admin_write on public.articles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_favorite_heroes
-- ---------------------------------------------------------------------------

create table public.user_favorite_heroes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  hero_id integer not null references public.heroes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, hero_id)
);

alter table public.user_favorite_heroes enable row level security;

create policy favorites_select on public.user_favorite_heroes
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = user_favorite_heroes.profile_id and p.leaderboard_opt_in
    )
  );
create policy favorites_insert_own on public.user_favorite_heroes
  for insert to authenticated with check (profile_id = auth.uid());
create policy favorites_delete_own on public.user_favorite_heroes
  for delete to authenticated using (profile_id = auth.uid());

revoke update on public.user_favorite_heroes from anon, authenticated;
