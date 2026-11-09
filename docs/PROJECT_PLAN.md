# ML Mongolia — Project Plan

## Goal
A mobile-first platform where Mongolian MLBB players prove they own their game account, track their rank over time, compare themselves on a community leaderboard, and read hero analytics and community news. The UI is in Mongolian.

## Starting point (2026-11-05)
The repository was empty: no code, no git history, no prior work. Everything below is new.

## Research summary
See [API_FEASIBILITY.md](API_FEASIBILITY.md). In short:

- ✅ **Hero analytics** are available from public Rone Arena endpoints, confirmed live.
- ⚠️ **Account verification and rank retrieval** are documented (in-game mail code → JWT → `/user/info`), but haven't been tested with a real account. **The project owner needs to run `npm run provider:probe` with their own account** to confirm.
- ❌ **No official leaderboard, rank history, or player lookup** by ID. We build these from our own verified, timestamped snapshots.
- ⚠️ **Commercial use of the hosted API requires an arrangement** with RoneAI (`hello@rone.dev`).

## Phases

### Phase 1 — Research and architecture ✅
- [x] Inspect the repository (empty)
- [x] Verify Rone Arena capabilities (OpenAPI, live probes, source, terms)
- [x] Document confirmed / unverified / unsupported capabilities
- [x] Architecture, database design, plan

### Phase 2 — Foundation ✅ (built 2026-11-05; not yet run against a live Supabase project)
- [x] Next.js 16.4 + TypeScript (strict) + Tailwind v4, Cache Components enabled
- [x] Validated environment config (`src/lib/env.ts`, `.env.example`)
- [x] Supabase clients (browser, server, service role, anonymous/cacheable) and session proxy
- [x] SQL migrations: all tables, RLS, triggers, state-transition functions, seed categories
- [x] PGlite DB tests for migrations, RLS, and SQL functions
- [x] Design tokens, UI kit (Button, Card, Input, Field, Badge, Skeleton, EmptyState, Alert)
- [x] Responsive navigation (bottom tabs on mobile, top bar on desktop)
- [x] i18n structure with Mongolian dictionary (English dictionary deferred)
- [x] Email/password + Google auth, registration, OAuth callback, logout

### Phase 3 — Core MVP ✅ (code complete; provider user flow unverified with a real account)
- [x] Provider layer: interface, Rone Arena client (Zod, retries, timeouts, allow-listed failover), mock provider, rank decoding
- [x] Token encryption (AES-256-GCM)
- [x] Verification service: start / complete, rate limits, identity check, ownership transfer, audit
- [x] `/dashboard/link-account` two-step UI with consent text and countdown
- [x] Manual verification request fallback + admin review (`/admin/verifications`)
- [x] `/dashboard`: rank card, highest rank, IDs, last sync, refresh button, progression chart
- [x] `/dashboard/rank-history`: chart + table from snapshots
- [x] Rank sync service + cron route + overlap lock + backoff + admin trigger (`/admin/sync`)
- [x] `/leaderboard`: opted-in verified players, tier filter, search, Top 10/100, weekly change, last updated
- [x] `/players/[username]`: public profile with share button
- [x] `/settings`: profile, leaderboard opt-in, unlink, delete account
- [x] `scripts/provider-probe.ts` (`npm run provider:probe`)

### Phase 4 — Content and analytics
- [x] Pilot: `/heroes`, `/heroes/[slug]`, `/items` with Mongolian skill/item text for 5 heroes + 5 items (AI draft, unreviewed). Translations are hash-pinned to the English source; `npm run translations:status` and the UI flag text changed by a patch
- [ ] Human review of the pilot translations
- [ ] Extend to all heroes/items; move translations to the DB with an admin review screen and AI drafts for changed text
- [ ] Hero sync job → `heroes`, `hero_statistics`
- [ ] `/heroes` directory (role filter, search), `/heroes/[slug]` (rates, counters, compatibility, builds)
- [ ] Tier list derived from win/pick/ban, with the method documented on the page
- [ ] News CMS: categories, rich-text editor, draft/published, featured, search, cover images (Supabase Storage)
- [ ] Admin: users (role management), news, categories (overview, manual verifications, and sync monitoring already exist)
- [ ] Favorite heroes UI (table + RLS exist), community announcements, leaderboard share image

### Phase 5 — Quality and deployment
- [ ] Route-handler tests and Playwright smoke tests (67 unit/DB/service tests exist)
- [ ] Generate Supabase types (`supabase gen types`) to replace hand-written row types
- [ ] English dictionary
- [ ] Security review (RLS audit, full nonce-based CSP, dependency audit)
- [ ] Performance: image optimization, caching, Lighthouse pass
- [ ] SEO: metadata, Open Graph images for players/articles, sitemap, robots
- [ ] Vercel deployment (`vercel.json` cron, README, and `.env.example` already exist)

## Actions needed from the project owner

| # | Action | Needed for |
|---|---|---|
| 1 | Create a Supabase project. Provide URL, anon key, service-role key | Phase 2 |
| 2 | Enable Google OAuth in Supabase (Google Cloud OAuth client, redirect URL) | Google login |
| 3 | Run `npm run provider:probe` with your own MLBB account and share the redacted output | Confirming the core feature |
| 4 | Contact `hello@rone.dev` about commercial use, if any monetization is planned | Launch |
| 5 | Create a Vercel project, set env vars, choose a plan (Hobby = daily cron only) | Deployment |
| 6 | Choose the first admin account (promote with SQL; see README) | Admin access |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider user flow doesn't work as documented | Medium | High | Manual verification fallback. Provider layer is swappable |
| Provider JWTs expire quickly, so sync stops | Medium | Medium | Detect 401 → "reconnect" prompt. History still accumulates on each re-verification |
| Provider outage / withdrawal | Medium | High | Cache hero data in DB. Clear degraded states. No hard dependency at render time |
| `rank_level` decoding assumption wrong | Low–Medium | Medium | Raw values stored; decoding in one tested function |
| Moonton changes upstream / objects to usage | Low | High | Out of our control. Keep data minimal, honor takedown requests |
| Few users opt in, so the leaderboard looks empty | Medium | Low | Good empty states; opt-in prompt after verification |

## Definition of done for "verification works"
A real MLBB account owner completes link-account on a deployed environment. A `provider`-sourced snapshot exists. The rank shown matches the in-game rank. **Until then, the README and admin sync page state that the integration is unverified.**
