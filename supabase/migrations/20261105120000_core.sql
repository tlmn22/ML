-- ML Mongolia — core schema: profiles, MLBB accounts, verification, rank history, sync, audit.
-- See docs/DATABASE_DESIGN.md for the reasoning behind each table and policy.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  role text not null default 'user' check (role in ('user', 'admin')),
  leaderboard_opt_in boolean not null default false,
  locale text not null default 'mn' check (locale in ('mn', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer so policies can call it without recursing into profiles RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
  v_tries integer := 0;
  v_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  v_base := regexp_replace(
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), '')),
    '[^a-z0-9_]', '', 'g'
  );
  if char_length(v_base) < 3 then
    v_base := 'player';
  end if;
  v_base := left(v_base, 14);
  v_candidate := v_base;

  while exists (select 1 from public.profiles where username = v_candidate) loop
    v_tries := v_tries + 1;
    if v_tries > 10 then
      raise exception 'could not allocate a unique username';
    end if;
    v_candidate := v_base || '_' || substr(md5(random()::text), 1, 5);
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    v_candidate,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 40),
    case when v_avatar like 'https://%' then v_avatar end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy profiles_select_all on public.profiles
  for select using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Clients may edit only these columns; role changes go through the server.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, leaderboard_opt_in, locale)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.audit_logs from anon, authenticated;

create or replace function public.write_audit(
  p_actor_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_hash text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata, ip_hash)
  values (p_actor_id, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb), p_ip_hash);
$$;

-- ---------------------------------------------------------------------------
-- sync_jobs
-- ---------------------------------------------------------------------------

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rank_sync', 'hero_sync')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  triggered_by text not null check (triggered_by in ('cron', 'admin', 'user')),
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz
);

-- At most one running job per kind: this is the overlap lock.
create unique index sync_jobs_one_running_per_kind
  on public.sync_jobs (kind) where status = 'running';
create index sync_jobs_started_at_idx on public.sync_jobs (started_at desc);

alter table public.sync_jobs enable row level security;

create policy sync_jobs_admin_read on public.sync_jobs
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.sync_jobs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- mlbb_accounts — verified accounts only
-- ---------------------------------------------------------------------------

create table public.mlbb_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  role_id bigint not null check (role_id > 0),
  zone_id integer not null check (zone_id > 0),
  nickname text,
  avatar_url text,
  reg_country text,
  level integer,
  verification_method text not null check (verification_method in ('provider_code', 'manual')),
  data_source text not null check (data_source in ('provider', 'admin_manual', 'mock')),
  status text not null default 'active' check (status in ('active', 'reauth_required')),
  verified_at timestamptz not null default now(),
  current_rank_level integer check (current_rank_level >= 0),
  highest_rank_level integer check (highest_rank_level >= 0),
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'error', 'reauth_required')),
  last_sync_error text,
  next_sync_at timestamptz,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One verified owner per game account.
  constraint mlbb_accounts_game_account_unique unique (role_id, zone_id)
);

create trigger mlbb_accounts_set_updated_at
  before update on public.mlbb_accounts
  for each row execute function public.set_updated_at();

create index mlbb_accounts_sync_due_idx on public.mlbb_accounts (next_sync_at)
  where status = 'active' and verification_method = 'provider_code';
create index mlbb_accounts_rank_idx on public.mlbb_accounts (current_rank_level desc nulls last);

alter table public.mlbb_accounts enable row level security;

create policy mlbb_accounts_select on public.mlbb_accounts
  for select using (
    profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = mlbb_accounts.profile_id and p.leaderboard_opt_in
    )
  );

revoke insert, update, delete on public.mlbb_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- mlbb_provider_sessions — SECRET. No client access at all.
-- ---------------------------------------------------------------------------

create table public.mlbb_provider_sessions (
  account_id uuid primary key references public.mlbb_accounts (id) on delete cascade,
  encrypted_token text not null,
  obtained_at timestamptz not null default now(),
  last_used_at timestamptz,
  invalidated_at timestamptz
);

alter table public.mlbb_provider_sessions enable row level security;
-- Intentionally no policies.
revoke all on public.mlbb_provider_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- mlbb_verification_attempts
-- ---------------------------------------------------------------------------

create table public.mlbb_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id bigint not null check (role_id > 0),
  zone_id integer not null check (zone_id > 0),
  method text not null check (method in ('provider_code', 'manual')),
  status text not null check (status in (
    'code_sent', 'verified', 'failed', 'expired',
    'pending_review', 'approved', 'rejected'
  )),
  code_submissions smallint not null default 0,
  expires_at timestamptz,
  failure_reason text,
  evidence jsonb not null default '{}'::jsonb,
  request_ip_hash text,
  user_note text check (char_length(user_note) <= 500),
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mlbb_verification_attempts_set_updated_at
  before update on public.mlbb_verification_attempts
  for each row execute function public.set_updated_at();

create index mlbb_attempts_profile_idx on public.mlbb_verification_attempts (profile_id, created_at desc);
create index mlbb_attempts_account_idx on public.mlbb_verification_attempts (role_id, zone_id, created_at desc);
create index mlbb_attempts_ip_idx on public.mlbb_verification_attempts (request_ip_hash, created_at desc);
create index mlbb_attempts_review_idx on public.mlbb_verification_attempts (created_at)
  where status = 'pending_review';

alter table public.mlbb_verification_attempts enable row level security;

create policy mlbb_attempts_select on public.mlbb_verification_attempts
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.mlbb_verification_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- rank_snapshots — append-only history
-- ---------------------------------------------------------------------------

create table public.rank_snapshots (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.mlbb_accounts (id) on delete cascade,
  rank_level integer not null check (rank_level >= 0),
  highest_rank_level integer check (highest_rank_level >= 0),
  source text not null check (source in ('provider', 'admin_manual', 'mock')),
  sync_job_id uuid references public.sync_jobs (id) on delete set null,
  captured_at timestamptz not null default now()
);

create index rank_snapshots_account_time_idx on public.rank_snapshots (account_id, captured_at desc);

alter table public.rank_snapshots enable row level security;

create policy rank_snapshots_select on public.rank_snapshots
  for select using (
    exists (select 1 from public.mlbb_accounts a where a.id = rank_snapshots.account_id)
  );

revoke insert, update, delete on public.rank_snapshots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- leaderboard_entries — security_invoker so the RLS above still applies.
-- Only provider-verified, provider-sourced, opted-in accounts appear.
-- ---------------------------------------------------------------------------

create view public.leaderboard_entries
with (security_invoker = true)
as
select
  rank() over (order by a.current_rank_level desc) as position,
  a.id as account_id,
  p.username,
  p.display_name,
  coalesce(a.avatar_url, p.avatar_url) as avatar_url,
  a.nickname,
  a.zone_id,
  a.current_rank_level as rank_level,
  a.highest_rank_level,
  a.status,
  a.last_synced_at,
  a.current_rank_level - week_ago.rank_level as weekly_change
from public.mlbb_accounts a
join public.profiles p on p.id = a.profile_id
left join lateral (
  select s.rank_level
  from public.rank_snapshots s
  where s.account_id = a.id
    and s.source = 'provider'
    and s.captured_at <= now() - interval '7 days'
    and s.captured_at > now() - interval '14 days'
  order by s.captured_at desc
  limit 1
) week_ago on true
where p.leaderboard_opt_in
  and a.verification_method = 'provider_code'
  and a.data_source = 'provider'
  and a.current_rank_level is not null;

-- ===========================================================================
-- Server-side state transitions (service role only).
-- Each runs in one transaction so partial verification can't happen.
-- ===========================================================================

-- Start an in-game code attempt, enforcing rate limits atomically.
create or replace function public.mlbb_start_code_attempt(
  p_profile_id uuid,
  p_role_id bigint,
  p_zone_id integer,
  p_ip_hash text,
  p_user_limit integer default 5,
  p_account_limit integer default 3,
  p_ip_limit integer default 10,
  p_ttl interval default interval '5 minutes'
)
returns table (out_attempt_id uuid, out_error text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('mlbb-target:' || p_role_id || ':' || p_zone_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mlbb-profile:' || p_profile_id, 0));

  if (select count(*) from public.mlbb_verification_attempts t
      where t.profile_id = p_profile_id and t.method = 'provider_code'
        and t.created_at > now() - interval '1 hour') >= p_user_limit then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  -- Across all users: protects a player's in-game mailbox from being flooded.
  if (select count(*) from public.mlbb_verification_attempts t
      where t.role_id = p_role_id and t.zone_id = p_zone_id and t.method = 'provider_code'
        and t.created_at > now() - interval '1 hour') >= p_account_limit then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  if p_ip_hash is not null and (select count(*) from public.mlbb_verification_attempts t
      where t.request_ip_hash = p_ip_hash and t.method = 'provider_code'
        and t.created_at > now() - interval '1 hour') >= p_ip_limit then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  update public.mlbb_verification_attempts t
     set status = 'expired'
   where t.profile_id = p_profile_id and t.status = 'code_sent';

  insert into public.mlbb_verification_attempts
    (profile_id, role_id, zone_id, method, status, expires_at, request_ip_hash)
  values
    (p_profile_id, p_role_id, p_zone_id, 'provider_code', 'code_sent', now() + p_ttl, p_ip_hash)
  returning id into v_id;

  perform public.write_audit(p_profile_id, 'mlbb.verify.code_requested', 'mlbb_verification_attempt',
    v_id::text, jsonb_build_object('zone_id', p_zone_id), p_ip_hash);

  return query select v_id, null::text;
end;
$$;

-- Reserve one code submission. Returns the attempt's target if it may proceed.
create or replace function public.mlbb_begin_code_submission(
  p_attempt_id uuid,
  p_profile_id uuid,
  p_max_submissions integer default 5
)
returns table (out_status text, out_role_id bigint, out_zone_id integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.mlbb_verification_attempts%rowtype;
begin
  select * into v_attempt
    from public.mlbb_verification_attempts t
   where t.id = p_attempt_id and t.profile_id = p_profile_id
   for update;

  if not found or v_attempt.method <> 'provider_code' then
    return query select 'not_found'::text, null::bigint, null::integer;
    return;
  end if;
  if v_attempt.status <> 'code_sent' then
    return query select 'closed'::text, null::bigint, null::integer;
    return;
  end if;
  if v_attempt.expires_at <= now() then
    update public.mlbb_verification_attempts set status = 'expired' where id = p_attempt_id;
    return query select 'expired'::text, null::bigint, null::integer;
    return;
  end if;
  if v_attempt.code_submissions >= p_max_submissions then
    update public.mlbb_verification_attempts
       set status = 'failed', failure_reason = 'too_many_submissions'
     where id = p_attempt_id;
    return query select 'too_many'::text, null::bigint, null::integer;
    return;
  end if;

  update public.mlbb_verification_attempts
     set code_submissions = code_submissions + 1
   where id = p_attempt_id;

  return query select 'ok'::text, v_attempt.role_id, v_attempt.zone_id;
end;
$$;

-- Record a failure. Terminal failures close the attempt; others allow a retry.
create or replace function public.mlbb_fail_attempt(
  p_attempt_id uuid,
  p_reason text,
  p_terminal boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mlbb_verification_attempts
     set failure_reason = p_reason,
         status = case when p_terminal then 'failed' else status end
   where id = p_attempt_id and status = 'code_sent';
$$;

-- Mark a game account verified for a profile. The caller has already checked that
-- the provider login succeeded and the provider identity matches the attempt.
create or replace function public.mlbb_finalize_verification(
  p_attempt_id uuid,
  p_profile_id uuid,
  p_nickname text,
  p_avatar_url text,
  p_reg_country text,
  p_level integer,
  p_rank_level integer,
  p_highest_rank_level integer,
  p_encrypted_token text,
  p_data_source text,
  p_evidence jsonb,
  p_next_sync_at timestamptz
)
returns table (out_account_id uuid, out_transferred_from uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.mlbb_verification_attempts%rowtype;
  v_existing public.mlbb_accounts%rowtype;
  v_account_id uuid;
  v_transferred_from uuid;
begin
  select * into v_attempt
    from public.mlbb_verification_attempts t
   where t.id = p_attempt_id and t.profile_id = p_profile_id
   for update;

  if not found or v_attempt.status <> 'code_sent' then
    raise exception 'attempt_not_open' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mlbb-target:' || v_attempt.role_id || ':' || v_attempt.zone_id, 0));

  select * into v_existing
    from public.mlbb_accounts a
   where a.role_id = v_attempt.role_id and a.zone_id = v_attempt.zone_id;

  -- A fresh in-game code proves current ownership, so it wins over an older link.
  if found and v_existing.profile_id <> p_profile_id then
    delete from public.mlbb_accounts where id = v_existing.id;
    v_transferred_from := v_existing.profile_id;
    perform public.write_audit(p_profile_id, 'mlbb.verify.ownership_transferred', 'mlbb_account',
      v_existing.id::text, jsonb_build_object('previous_profile_id', v_existing.profile_id));
  end if;

  -- A profile links one game account; linking another replaces it.
  delete from public.mlbb_accounts a
   where a.profile_id = p_profile_id
     and not (a.role_id = v_attempt.role_id and a.zone_id = v_attempt.zone_id);

  insert into public.mlbb_accounts as a (
    profile_id, role_id, zone_id, nickname, avatar_url, reg_country, level,
    verification_method, data_source, status, verified_at,
    current_rank_level, highest_rank_level,
    last_synced_at, last_sync_status, last_sync_error, next_sync_at, consecutive_failures
  ) values (
    p_profile_id, v_attempt.role_id, v_attempt.zone_id, p_nickname, p_avatar_url, p_reg_country, p_level,
    'provider_code', p_data_source, 'active', now(),
    p_rank_level, p_highest_rank_level,
    now(), 'ok', null, p_next_sync_at, 0
  )
  on conflict (profile_id) do update set
    nickname = excluded.nickname,
    avatar_url = excluded.avatar_url,
    reg_country = excluded.reg_country,
    level = excluded.level,
    verification_method = 'provider_code',
    data_source = excluded.data_source,
    status = 'active',
    verified_at = now(),
    current_rank_level = coalesce(excluded.current_rank_level, a.current_rank_level),
    highest_rank_level = coalesce(excluded.highest_rank_level, a.highest_rank_level),
    last_synced_at = now(),
    last_sync_status = 'ok',
    last_sync_error = null,
    next_sync_at = excluded.next_sync_at,
    consecutive_failures = 0
  returning a.id into v_account_id;

  insert into public.mlbb_provider_sessions (account_id, encrypted_token)
  values (v_account_id, p_encrypted_token)
  on conflict (account_id) do update set
    encrypted_token = excluded.encrypted_token,
    obtained_at = now(),
    last_used_at = null,
    invalidated_at = null;

  if p_rank_level is not null then
    insert into public.rank_snapshots (account_id, rank_level, highest_rank_level, source)
    values (v_account_id, p_rank_level, p_highest_rank_level, p_data_source);
  end if;

  update public.mlbb_verification_attempts
     set status = 'verified', evidence = coalesce(p_evidence, '{}'::jsonb), failure_reason = null
   where id = p_attempt_id;

  perform public.write_audit(p_profile_id, 'mlbb.verify.success', 'mlbb_account', v_account_id::text,
    jsonb_build_object('zone_id', v_attempt.zone_id, 'data_source', p_data_source));

  return query select v_account_id, v_transferred_from;
end;
$$;

-- Manual fallback: a user asks an admin to verify ownership.
create or replace function public.mlbb_submit_manual_request(
  p_profile_id uuid,
  p_role_id bigint,
  p_zone_id integer,
  p_note text,
  p_ip_hash text,
  p_daily_limit integer default 3
)
returns table (out_attempt_id uuid, out_error text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('mlbb-profile:' || p_profile_id, 0));

  if exists (select 1 from public.mlbb_verification_attempts t
             where t.profile_id = p_profile_id and t.status = 'pending_review') then
    return query select null::uuid, 'already_pending'::text;
    return;
  end if;
  if (select count(*) from public.mlbb_verification_attempts t
      where t.profile_id = p_profile_id and t.method = 'manual'
        and t.created_at > now() - interval '1 day') >= p_daily_limit then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  insert into public.mlbb_verification_attempts
    (profile_id, role_id, zone_id, method, status, user_note, request_ip_hash)
  values
    (p_profile_id, p_role_id, p_zone_id, 'manual', 'pending_review', left(p_note, 500), p_ip_hash)
  returning id into v_id;

  perform public.write_audit(p_profile_id, 'mlbb.manual.requested', 'mlbb_verification_attempt',
    v_id::text, jsonb_build_object('zone_id', p_zone_id), p_ip_hash);

  return query select v_id, null::text;
end;
$$;

-- Admin decision on a manual request. Manual approval never overrides an
-- account verified by in-game code.
create or replace function public.mlbb_review_manual_request(
  p_attempt_id uuid,
  p_reviewer_id uuid,
  p_approve boolean,
  p_note text,
  p_rank_level integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.mlbb_verification_attempts%rowtype;
  v_account_id uuid;
begin
  select * into v_attempt
    from public.mlbb_verification_attempts t
   where t.id = p_attempt_id
   for update;

  if not found or v_attempt.status <> 'pending_review' then
    return 'not_pending';
  end if;

  if not p_approve then
    update public.mlbb_verification_attempts
       set status = 'rejected', review_note = left(p_note, 500),
           reviewed_by = p_reviewer_id, reviewed_at = now()
     where id = p_attempt_id;
    perform public.write_audit(p_reviewer_id, 'mlbb.manual.rejected', 'mlbb_verification_attempt',
      p_attempt_id::text, '{}'::jsonb);
    return 'rejected';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mlbb-target:' || v_attempt.role_id || ':' || v_attempt.zone_id, 0));

  if exists (select 1 from public.mlbb_accounts a
             where a.role_id = v_attempt.role_id and a.zone_id = v_attempt.zone_id
               and a.profile_id <> v_attempt.profile_id) then
    return 'already_linked';
  end if;

  delete from public.mlbb_accounts a
   where a.profile_id = v_attempt.profile_id
     and not (a.role_id = v_attempt.role_id and a.zone_id = v_attempt.zone_id);

  insert into public.mlbb_accounts as a (
    profile_id, role_id, zone_id, verification_method, data_source, status,
    verified_at, current_rank_level, next_sync_at
  ) values (
    v_attempt.profile_id, v_attempt.role_id, v_attempt.zone_id, 'manual', 'admin_manual', 'active',
    now(), p_rank_level, null
  )
  on conflict (profile_id) do update set
    verification_method = 'manual',
    data_source = 'admin_manual',
    status = 'active',
    verified_at = now(),
    current_rank_level = coalesce(excluded.current_rank_level, a.current_rank_level),
    next_sync_at = null
  returning a.id into v_account_id;

  if p_rank_level is not null then
    insert into public.rank_snapshots (account_id, rank_level, source)
    values (v_account_id, p_rank_level, 'admin_manual');
  end if;

  update public.mlbb_verification_attempts
     set status = 'approved', review_note = left(p_note, 500),
         reviewed_by = p_reviewer_id, reviewed_at = now(),
         evidence = jsonb_build_object('method', 'manual_review', 'reviewer_id', p_reviewer_id)
   where id = p_attempt_id;

  perform public.write_audit(p_reviewer_id, 'mlbb.manual.approved', 'mlbb_account',
    v_account_id::text, jsonb_build_object('attempt_id', p_attempt_id));
  return 'approved';
end;
$$;

-- Claim the sync lock for a job kind. Returns null if another run is active.
create or replace function public.claim_sync_job(
  p_kind text,
  p_triggered_by text,
  p_stale_after interval default interval '15 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.sync_jobs
     set status = 'failed', error = 'stale: no heartbeat', finished_at = now()
   where kind = p_kind and status = 'running' and heartbeat_at < now() - p_stale_after;

  begin
    insert into public.sync_jobs (kind, triggered_by) values (p_kind, p_triggered_by)
    returning id into v_id;
  exception when unique_violation then
    return null;
  end;
  return v_id;
end;
$$;

create or replace function public.finish_sync_job(
  p_job_id uuid,
  p_processed integer,
  p_succeeded integer,
  p_failed integer,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sync_jobs
     set processed = p_processed,
         succeeded = p_succeeded,
         failed = p_failed,
         error = p_error,
         finished_at = now(),
         heartbeat_at = now(),
         status = case
           when p_error is not null and p_succeeded = 0 then 'failed'
           when p_failed > 0 then 'partial'
           else 'succeeded'
         end
   where id = p_job_id and status = 'running';
$$;

-- Accounts due for sync, with their encrypted provider token.
create or replace function public.mlbb_due_sync_accounts(p_limit integer)
returns table (out_account_id uuid, out_encrypted_token text)
language sql
security definer
set search_path = ''
as $$
  select a.id, s.encrypted_token
    from public.mlbb_accounts a
    join public.mlbb_provider_sessions s on s.account_id = a.id and s.invalidated_at is null
   where a.status = 'active'
     and a.verification_method = 'provider_code'
     and a.next_sync_at is not null
     and a.next_sync_at <= now()
   order by a.next_sync_at
   limit p_limit;
$$;

create or replace function public.mlbb_account_token(p_account_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select s.encrypted_token
    from public.mlbb_provider_sessions s
    join public.mlbb_accounts a on a.id = s.account_id
   where s.account_id = p_account_id
     and s.invalidated_at is null
     and a.status = 'active';
$$;

-- Store a successful sync. Snapshot only on change or after 24h of no snapshot.
create or replace function public.mlbb_record_sync_success(
  p_account_id uuid,
  p_job_id uuid,
  p_nickname text,
  p_avatar_url text,
  p_reg_country text,
  p_level integer,
  p_rank_level integer,
  p_highest_rank_level integer,
  p_data_source text,
  p_next_sync_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_level integer;
  v_last_at timestamptz;
  v_inserted boolean := false;
begin
  select s.rank_level, s.captured_at into v_last_level, v_last_at
    from public.rank_snapshots s
   where s.account_id = p_account_id
   order by s.captured_at desc
   limit 1;

  if p_rank_level is not null and (
       v_last_at is null
       or v_last_level is distinct from p_rank_level
       or v_last_at < now() - interval '24 hours'
     ) then
    insert into public.rank_snapshots (account_id, rank_level, highest_rank_level, source, sync_job_id)
    values (p_account_id, p_rank_level, p_highest_rank_level, p_data_source, p_job_id);
    v_inserted := true;
  end if;

  update public.mlbb_accounts
     set nickname = coalesce(p_nickname, nickname),
         avatar_url = coalesce(p_avatar_url, avatar_url),
         reg_country = coalesce(p_reg_country, reg_country),
         level = coalesce(p_level, level),
         current_rank_level = coalesce(p_rank_level, current_rank_level),
         highest_rank_level = coalesce(p_highest_rank_level, highest_rank_level),
         data_source = p_data_source,
         last_synced_at = now(),
         last_sync_status = 'ok',
         last_sync_error = null,
         consecutive_failures = 0,
         next_sync_at = p_next_sync_at
   where id = p_account_id;

  update public.mlbb_provider_sessions set last_used_at = now() where account_id = p_account_id;

  if p_job_id is not null then
    update public.sync_jobs set heartbeat_at = now() where id = p_job_id;
  end if;

  return v_inserted;
end;
$$;

-- Store a failed sync. 'unauthorized' means the player must re-verify;
-- anything else backs off exponentially (1h, 2h, 4h … capped at 48h).
create or replace function public.mlbb_record_sync_failure(
  p_account_id uuid,
  p_job_id uuid,
  p_error_kind text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error_kind = 'unauthorized' then
    update public.mlbb_accounts
       set status = 'reauth_required',
           last_sync_status = 'reauth_required',
           last_sync_error = left(p_error_message, 300),
           next_sync_at = null
     where id = p_account_id;
    update public.mlbb_provider_sessions set invalidated_at = now() where account_id = p_account_id;
  else
    update public.mlbb_accounts
       set consecutive_failures = consecutive_failures + 1,
           last_sync_status = 'error',
           last_sync_error = left(p_error_message, 300),
           next_sync_at = now() + least(
             interval '1 hour' * power(2, least(consecutive_failures, 10)),
             interval '48 hours'
           )
     where id = p_account_id;
  end if;

  if p_job_id is not null then
    update public.sync_jobs set heartbeat_at = now() where id = p_job_id;
  end if;
end;
$$;

-- Lock down every state-transition function to the service role.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.write_audit(uuid, text, text, text, jsonb, text)',
    'public.mlbb_start_code_attempt(uuid, bigint, integer, text, integer, integer, integer, interval)',
    'public.mlbb_begin_code_submission(uuid, uuid, integer)',
    'public.mlbb_fail_attempt(uuid, text, boolean)',
    'public.mlbb_finalize_verification(uuid, uuid, text, text, text, integer, integer, integer, text, text, jsonb, timestamptz)',
    'public.mlbb_submit_manual_request(uuid, bigint, integer, text, text, integer)',
    'public.mlbb_review_manual_request(uuid, uuid, boolean, text, integer)',
    'public.claim_sync_job(text, text, interval)',
    'public.finish_sync_job(uuid, integer, integer, integer, text)',
    'public.mlbb_due_sync_accounts(integer)',
    'public.mlbb_account_token(uuid)',
    'public.mlbb_record_sync_success(uuid, uuid, text, text, text, integer, integer, integer, text, timestamptz)',
    'public.mlbb_record_sync_failure(uuid, uuid, text, text)',
    'public.handle_new_user()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
