# Architecture

## System overview

```
Browser ──HTTPS──▶ Next.js on Vercel (App Router)
                    ├─ Server Components / Route Handlers ──▶ Supabase (Postgres + Auth)
                    │      │                                   ▲ RLS on every table
                    │      └─▶ MLBB provider layer ──HTTPS──▶ Rone Arena API ──▶ Moonton upstream
                    └─ /api/cron/* ◀── Vercel Cron (CRON_SECRET)
```

- The **browser never talks to Rone Arena** and never sees a provider JWT.
- The browser talks to Supabase directly only for auth and RLS-protected reads/writes of its own data, using the anon key.
- Anything that writes provider-derived data, or touches secrets, runs in a Route Handler or Server Action with the **service-role client**. That client lives in a `server-only` module, so it can't be bundled for the browser.

## Directory layout

```
src/
  proxy.ts                  Session refresh + redirect for /dashboard, /settings, /admin
                            (Next 16 renamed middleware.ts → proxy.ts)
  app/                      Routes (App Router)
    page.tsx, leaderboard/, players/[username]/      public
    login/, register/, auth/callback, auth/signout   auth
    dashboard/ (+ link-account/, rank-history/), settings/   signed-in
    admin/ (overview, verifications/, sync/)          admin (role checked server-side)
    api/
      mlbb/verification/    start, complete, manual
      mlbb/sync             user-triggered refresh (cooldown)
      cron/sync-ranks       scheduled sync (Vercel Cron)
  components/               ui/primitives.tsx (design system) + feature components
  lib/
    mlbb/                   ── provider integration layer ──
      types.ts              Internal domain models (provider-agnostic)
      provider.ts           MlbbProvider interface + ProviderError taxonomy
      ranks.ts              rank_level → tier/division/stars (pure, contract-tested)
      rone-arena/           client.ts (HTTP), schemas.ts (Zod), provider.ts (normalization)
      mock/                 Deterministic mock provider (dev/test only)
      index.ts              getMlbbProvider() factory with production guard
    services/               verification.ts, rank-sync.ts (pure orchestration),
                            supabase-stores.ts (RPC adapters), runtime.ts (wiring),
                            accounts.ts, leaderboard.ts, players.ts (reads)
    supabase/               server.ts (cookies), client.ts (browser), admin.ts (service role),
                            public.ts (anonymous, cache-safe)
    security/               crypto.ts (AES-GCM, IP hash), request.ts (origin check, client IP)
    i18n/                   typed dictionaries (mn) + formatting helpers
    env.ts                  Validated server environment (Zod), parsed lazily
    http.ts                 guardJsonRoute(): origin + JSON + session + schema
supabase/migrations/        SQL migrations (tables, RLS, state-transition functions)
tests/
  db/                       PGlite: migrations, RLS, SQL functions
  services/                 Services + real Supabase adapters against PGlite
  unit/                     Rank decoding, HTTP client, crypto, provider factory
  fixtures/rone-arena/      Live-captured provider data for contract tests
scripts/provider-probe.ts   Manual end-to-end check with your own account
```

## Key decisions

### 1. The provider layer is a port, not a library
`MlbbProvider` is a small interface: `requestVerificationCode`, `completeVerification`, `getPlayerProfile`, `endSession`, `listHeroes`, `getHeroStatistics`, `getRankBands`. Business code (`lib/services`) depends only on the interface and the internal types. **Why:** Rone Arena is unofficial, has no SLA, and may change or disappear. Replacing it, or adding an official source later, should touch only `lib/mlbb/<provider>/`.

### 2. Every external response is validated
Zod schemas in `rone-arena/schemas.ts` parse every response. Unknown fields are allowed, missing required ones are an error. Normalizers convert the provider's shapes (`roleId` vs `roleid`, rates as 0–1 floats, wsrv-proxied image URLs) into internal types. A response that fails validation becomes a `ProviderError('invalid_response')`. It's never half-used.

### 3. One error taxonomy
`ProviderError.kind` is one of: `invalid_input`, `invalid_code`, `unauthorized` (JWT expired/invalid → re-verify), `rate_limited`, `unavailable` (5xx/timeout/maintenance), `invalid_response`, `unknown`. Services map these to user-facing messages and sync-backoff decisions. Raw provider messages are logged, never shown.

### 4. Resilient HTTP client
- Timeout per request (default 8s, `AbortController`).
- Retries only idempotent GETs, on 5xx/timeout/network errors, with exponential backoff and jitter (max 2 retries). **Never retries `send-vc`**, because a retry would send the player a second mail.
- On 503 with `alternative_endpoint` in the body, switches to that host only if it's on `RONE_ARENA_ALLOWED_HOSTS`.
- Honors `Retry-After` when present.
- Public GETs use Next's fetch cache (`revalidate`), and we persist hero data to Postgres so pages render during outages.

### 5. Mock provider, with guard rails
`MLBB_PROVIDER=mock` enables a deterministic mock (any Role ID; the code is always `0000` in development). Guard rails:
- `getMlbbProvider()` **throws on first use** if `MLBB_PROVIDER=mock` and `VERCEL_ENV=production`.
- Snapshots it produces are written with `source = 'mock'`. The leaderboard view excludes non-`provider` sources.
- A "DEMO" banner shows on every page whenever the mock provider is active. It is evaluated per request, so a reused build can't hide it.

### 6. Verification flow

```
User            Next.js server                          Rone Arena           Game
 │ roleId,zoneId  │                                          │                  │
 ├───────────────▶│ validate, rate-limit (user, account, IP) │                  │
 │                │ insert attempt(status=code_sent,+5min)   │                  │
 │                ├── POST /user/auth/send-vc ──────────────▶├─────────────────▶│ in-game mail
 │◀── attemptId ──┤                                          │                  │
 │ 4-digit code   │                                          │                  │
 ├───────────────▶│ check attempt owner/expiry/submissions   │                  │
 │                ├── POST /user/auth/login {vc} ───────────▶│                  │
 │                │◀── jwt ──────────────────────────────────┤                  │
 │                ├── GET /user/info (Bearer jwt) ──────────▶│                  │
 │                │◀── roleId, zoneId, rank_level … ─────────┤                  │
 │                │ ASSERT provider roleId/zoneId == requested (else identity_mismatch)
 │                │ upsert mlbb_accounts (transfer if owned by another user, audit)
 │                │ store encrypted jwt, insert rank snapshot, audit log
 │◀── verified ───┤                                          │                  │
```

An account is marked verified **only** after a successful login **and** a profile response whose IDs match the request. Those two facts are the evidence, and they're recorded in `attempt.evidence`.

**Account enumeration:** the start step answers the same way whether or not the MLBB account is already linked. Ownership conflicts are resolved only after proof of ownership. Registration and login use Supabase Auth's generic errors.

### 7. Rank synchronization
- **Trigger:** Vercel Cron calls `/api/cron/sync-ranks` (header `Authorization: Bearer $CRON_SECRET`). Admins can also trigger it from `/admin/sync`. Users can refresh their own account at most once every `USER_SYNC_COOLDOWN_MINUTES`.
- **Claiming:** insert into `sync_jobs` with `status='running'`. The unique partial index rejects overlapping runs. Stale runs (heartbeat > 15 min) are failed first.
- **Selection:** `status='active' and verification_method='provider_code' and next_sync_at <= now()`, ordered by `next_sync_at`, limited to `SYNC_BATCH_SIZE`.
- **Pacing:** sequential with `SYNC_REQUEST_DELAY_MS` between calls; the run stops before the function time budget runs out.
- **Scheduling:** success → `next_sync_at = now + SYNC_INTERVAL_HOURS` (default 12). Failure → exponential backoff (1h, 2h, 4h … capped at 48h). `unauthorized` → `status='reauth_required'`, token invalidated, no more retries until the user re-verifies.
- **Snapshots:** written only on change or after 24h (see DATABASE_DESIGN).

The Vercel Hobby plan allows daily cron only, so the default `vercel.json` schedule is daily. On Pro, raise the frequency. Each run processes only due accounts, so frequency and per-account interval are independent.

### 8. State transitions live in Postgres
Verification and sync state changes are SQL functions (`mlbb_start_code_attempt`, `mlbb_finalize_verification`, `mlbb_record_sync_success`, `claim_sync_job`, …). They're executable only by the service role.
- **Atomicity:** finalizing a verification touches five tables (account, session, snapshot, attempt, audit). One function means one transaction, so a half-verified state can't exist.
- **Race safety:** rate-limit counts and ownership checks run under advisory locks keyed by the game account.
- **Testability:** the same functions run in PGlite. The TypeScript services (`verification.ts`, `rank-sync.ts`) only orchestrate provider calls around them, and their tests run through the real `supabase-stores.ts` adapters via a PGlite-backed `rpc()` stand-in.

### 9. Rendering under Cache Components
Next 16 is configured with `cacheComponents` and `partialPrefetching` (create-next-app defaults).
- Anything that reads cookies, `params`, `searchParams`, or `usePathname()` sits inside `<Suspense>`. The fallback is the skeleton that ships in the static shell.
- Public reads (`getLeaderboard`, `getPublicPlayer`) use a cookie-less anonymous client inside `"use cache"` with `cacheLife("minutes")` and tags. Mutations invalidate them with `updateTag` (Server Actions) or `revalidateTag(tag, "max")` (Route Handlers).
- Anything safety-relevant that depends on runtime env (the DEMO banner) calls `connection()`, so it can't be frozen at build time.

### 10. Auth and authorization
- Supabase Auth with email/password and Google OAuth, using the `@supabase/ssr` cookie session.
- `src/proxy.ts` refreshes the session and redirects unauthenticated users away from `/dashboard`, `/settings`, and `/admin`.
- Admin pages check `profiles.role = 'admin'` on the server in `admin/layout.tsx`. Admin route handlers check again; never trust the layout alone.
- RLS is the last line of defense. Every table has RLS enabled, and DB tests prove that anon/authenticated users can't read secrets or write provider data.

### 11. Security controls
| Control | Implementation |
|---|---|
| Secret isolation | `server-only` imports. Service key and encryption key are never `NEXT_PUBLIC_` |
| Token encryption | AES-256-GCM via Node `crypto`, 32-byte key from env, versioned ciphertext |
| Input validation | Zod at every route boundary |
| Rate limiting | Verification: ≤5 codes/user/h, ≤3/game account/h (all users), ≤10/IP/h, ≤5 submissions/attempt, ≤3 manual requests/day. Self-refresh cooldown. Supabase Auth limits on login/signup |
| IP privacy | Salted SHA-256 hash only |
| CSRF | Route handlers accept JSON only and check `Origin` against the site URL |
| Security headers | `X-Frame-Options`, HSTS, `Referrer-Policy`, `Permissions-Policy`, and a partial CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`) in `next.config.ts`. A full script-src CSP needs per-request nonces (Phase 5) |
| Audit | `audit_logs` for verification, ownership change, role change, deletion, publishing |
| Deletion | `/settings` → provider logout → `auth.admin.deleteUser` → cascades |

### 12. UI system
- Tailwind v4 with CSS-variable design tokens (`--color-bg`, `--color-gold`, `--color-electric`, `--color-violet` …). Dark by default.
- Mobile-first: bottom tab bar under `md`, top bar on desktop.
- Every data component has loading (skeleton), empty, and error states.
- Charts are small inline-SVG components. No charting dependency for one line chart.
- Rank emblems come from the provider's rank-band icons (`/api/academy/ranks`), cached with the hero sync.

### 13. Internationalization
UI strings live in `lib/i18n/dictionaries/mn.ts`. Its type (`Dictionary`) is the contract: an `en.ts` typed as `Dictionary` can't miss a key without failing type-checking. Register it in `lib/i18n/index.ts`. `profiles.locale` already exists for per-user choice. Routes aren't locale-prefixed yet; adding `[locale]` segments later doesn't require changing the dictionaries. Gaming terms (rank tiers, Hero, Leaderboard, Game ID) stay in English, as players use them.

### 14. Extensibility
Tournaments, teams, comparisons, and challenges will be new tables that reference `profiles` and `mlbb_accounts`, plus new route groups. Nothing in the current schema assumes one account per user except a unique constraint, which can be dropped if multi-account support is wanted.
