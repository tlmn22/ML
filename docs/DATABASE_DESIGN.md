# Database Design

PostgreSQL on Supabase. Migrations live in `supabase/migrations/` and are applied in filename order. Tests in `tests/db/` run the same migrations against PGlite (Postgres compiled to WASM) with a small stub for Supabase's `auth` schema and roles. That way schema and RLS are checked in CI without Docker.

## Principles

1. **Players own their data.** A player's MLBB data is readable by others only when the player has opted in to public rankings.
2. **Clients never write provider-derived data.** Rows in `mlbb_accounts`, `rank_snapshots`, `heroes`, and `hero_statistics` are written only by server code using the service role, after validating provider responses. Clients can't fake a rank.
3. **Secrets live apart.** Provider JWTs live in `mlbb_provider_sessions`, encrypted by the app, with RLS enabled, **no policies**, and all grants revoked from `anon`/`authenticated`.
4. **Verification codes are never stored.** The 4-digit code is created by the game and checked by the provider. Our server forwards it once and keeps nothing. Attempts store only status, counts, and timestamps.
5. **History is append-only.** Rank snapshots are never updated, only inserted. Every snapshot records its `source`, so mock or manual data can always be told apart from provider data.

## Entity overview

```
auth.users 1─1 profiles 1─0..1 mlbb_accounts 1─0..1 mlbb_provider_sessions
                  │                  │
                  │                  └─1─* rank_snapshots *─0..1 sync_jobs
                  ├─1─* mlbb_verification_attempts
                  ├─1─* user_favorite_heroes *─1 heroes 1─* hero_statistics
                  ├─1─* articles *─1 article_categories
                  └─1─* audit_logs (actor)
```

## Tables

### `profiles`
One row per `auth.users` row, created by trigger `handle_new_user`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK `auth.users(id)` on delete cascade |
| `username` | text unique | `^[a-z0-9_]{3,20}$`, used in `/players/[username]` |
| `display_name` | text | ≤ 40 chars |
| `avatar_url` | text | |
| `role` | text | `user` \| `admin`. Clients can't update this column (column-level grants) |
| `leaderboard_opt_in` | boolean | default **false** (privacy by default) |
| `locale` | text | default `mn` |
| `created_at`, `updated_at` | timestamptz | |

RLS: anyone can read. Users can update their own row, but only the columns `username, display_name, avatar_url, leaderboard_opt_in, locale`.

### `mlbb_accounts`
A **verified** MLBB account linked to a profile. Unverified attempts never create a row here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid unique | FK `profiles` cascade. One linked account per user in the MVP |
| `role_id` | bigint | Game ID |
| `zone_id` | integer | Server ID |
| `nickname`, `avatar_url`, `reg_country`, `level` | | From provider |
| `verification_method` | text | `provider_code` \| `manual` |
| `status` | text | `active` \| `reauth_required` |
| `verified_at` | timestamptz | When ownership was proved |
| `current_rank_level`, `highest_rank_level` | integer | Denormalized from the latest snapshot |
| `last_synced_at`, `last_sync_status`, `last_sync_error` | | Sync tracking |
| `next_sync_at` | timestamptz | Scheduler cursor |
| `consecutive_failures` | integer | Drives backoff |

Constraints:
- `unique (role_id, zone_id)` — **an MLBB account can be verified by only one user.** If another user later proves ownership with a fresh in-game code, ownership moves to them (they hold the game account now). This is audit-logged.
- Index `(next_sync_at) where status = 'active' and verification_method = 'provider_code'` for the scheduler.

RLS: the owner can read their row. Others can read it only when the owner's `leaderboard_opt_in` is true. No client writes.

### `mlbb_provider_sessions` (secret)

| Column | Type | Notes |
|---|---|---|
| `account_id` | uuid PK | FK `mlbb_accounts` cascade |
| `encrypted_token` | text | AES-256-GCM, `v1:iv:tag:ciphertext` base64 |
| `obtained_at`, `last_used_at`, `invalidated_at` | timestamptz | |

RLS enabled, **no policies**; `revoke all` from `anon, authenticated`. Only the service role can access it.

### `mlbb_verification_attempts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid | FK `profiles` cascade |
| `role_id`, `zone_id` | | Requested account |
| `method` | text | `provider_code` \| `manual` |
| `status` | text | `code_sent`, `verified`, `failed`, `expired`, `pending_review`, `approved`, `rejected` |
| `code_submissions` | smallint | Max 5 per attempt |
| `expires_at` | timestamptz | `created_at + 5 min` for code attempts |
| `failure_reason` | text | Machine code, e.g. `invalid_code`, `provider_unavailable`, `identity_mismatch` |
| `evidence` | jsonb | Non-secret proof, e.g. `{ "provider_role_id": …, "provider_zone_id": …, "checked_at": … }` |
| `request_ip_hash` | text | SHA-256 of IP + salt. Raw IPs are never stored |
| `user_note`, `review_note`, `reviewed_by`, `reviewed_at` | | Manual flow |

Rate limits are enforced by counting rows:
- per user: ≤ 5 code requests per hour
- per `(role_id, zone_id)`: ≤ 3 code requests per hour across **all** users (stops anyone from flooding a player's in-game mail)
- per attempt: ≤ 5 code submissions

RLS: users read their own attempts. Admins read all.

### `rank_snapshots` (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | |
| `account_id` | uuid | FK `mlbb_accounts` cascade |
| `rank_level` | integer | Raw provider value, decoded in the app (see `src/lib/mlbb/ranks.ts`) |
| `highest_rank_level` | integer | nullable |
| `source` | text | `provider` \| `admin_manual` \| `mock` |
| `sync_job_id` | uuid | nullable FK `sync_jobs` |
| `captured_at` | timestamptz | |

We store the raw value instead of decoded tier/stars, so if the decoding assumption (U4/U5 in API_FEASIBILITY) is fixed later, all history is re-interpreted correctly without a data migration.

Write policy: the sync inserts a new snapshot only when `rank_level` changed, or when the last snapshot is more than 24h old. This keeps history dense enough for weekly deltas without storing duplicates.

RLS: same visibility as the parent account.

### `leaderboard_entries` (view, `security_invoker = true`)
Joins opted-in profiles → `provider_code`-verified, `provider`-sourced accounts (manual and mock accounts never appear). Exposes `position` (a `rank()` over all visible entries, so it stays global when the client filters by tier or search) and `weekly_change` (current level minus the newest provider snapshot that is 7–14 days old; null if none). Since it's a security-invoker view, the RLS of the underlying tables still applies.

### `heroes`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Provider `hero_id` |
| `slug` | text unique | e.g. `yi-sun-shin` |
| `name`, `head_image_url` | text | |
| `roles`, `lanes` | text[] | |
| `relations` | jsonb | Provider strong/weak/assist IDs |
| `updated_at` | timestamptz | |

### `hero_statistics`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint identity PK | |
| `hero_id` | integer | FK `heroes` |
| `rank_bracket` | text | Provider `rank` filter, e.g. `all`, `mythic` |
| `window_days` | smallint | Provider `days` |
| `win_rate`, `pick_rate`, `ban_rate` | numeric(7,6) | 0–1 |
| `game_version` | text | From `/academy/meta/version` at capture time |
| `captured_at` | timestamptz | |

Unique `(hero_id, rank_bracket, window_days, captured_at)`. Public read.

### `article_categories`, `articles`
Categories are seeded: `mlbb-news, patch-notes, hero-guides, hero-builds, esports, mongolia-community, events, entertainment`.

`articles`: `id, slug unique, title, excerpt, content jsonb (rich-text document), cover_image_url, category_id, status (draft|published|archived), is_featured, author_id (set null on delete), published_at, search tsvector (generated), created_at, updated_at`.

RLS: anyone reads `published` rows where `published_at <= now()`. Admins have full access.

### `user_favorite_heroes`
`(profile_id, hero_id)` PK. Users manage their own rows. Public read follows the profile's opt-in.

### `sync_jobs`

| Column | Notes |
|---|---|
| `kind` | `rank_sync` \| `hero_sync` |
| `status` | `running` \| `succeeded` \| `partial` \| `failed` |
| `triggered_by` | `cron` \| `admin` \| `user` |
| `processed`, `succeeded`, `failed` | counters |
| `error`, `started_at`, `finished_at`, `heartbeat_at` | |

**Overlap protection:** unique partial index `on (kind) where status = 'running'`. A second job of the same kind fails to insert. Jobs with a `heartbeat_at` older than 15 minutes are marked `failed` before a new claim, so a crashed run can't block sync forever.

Admin read only.

### `audit_logs`
`id, actor_id (set null), action, target_type, target_id, metadata jsonb, ip_hash, created_at`. Server-only insert. Admin read only. Logged actions include `mlbb.verify.code_sent`, `mlbb.verify.success`, `mlbb.verify.ownership_transferred`, `mlbb.unlink`, `mlbb.manual.approved`, `admin.role_changed`, `account.deleted`, and `article.published`.

## Helper functions

- `public.is_admin()` — `security definer`, `stable`. Checks `profiles.role = 'admin'` for `auth.uid()`. Used inside policies; it avoids recursive RLS on `profiles`.
- `public.handle_new_user()` — trigger on `auth.users` insert. Creates a profile with a unique username derived from email/metadata.
- `public.set_updated_at()` — generic trigger.

## Privacy and deletion

- Deleting the auth user cascades to `profiles`, then `mlbb_accounts`, `mlbb_provider_sessions`, `rank_snapshots`, attempts, and favorites. Before deleting, the server calls the provider `logout` (best effort).
- Audit log rows survive with `actor_id = null` and no personal data in `metadata`.
- Opting out of the leaderboard hides the account, snapshots, and favorites from other users immediately (RLS), without deleting anything.
