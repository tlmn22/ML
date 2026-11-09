# ML Mongolia

Mobile-first community platform for Mongolian Mobile Legends: Bang Bang players. Players link their MLBB account with an in-game verification code, track their rank history, and compare themselves on a community leaderboard.

> **Integration status:** the Rone Arena verification flow (in-game code → session → rank) is implemented and tested against documented responses, but **has not yet been confirmed with a real MLBB account**. Run `npm run provider:probe` with your own account to confirm it. See [docs/API_FEASIBILITY.md](docs/API_FEASIBILITY.md).

| Doc | Contents |
|---|---|
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Phases, status, risks, owner actions |
| [docs/API_FEASIBILITY.md](docs/API_FEASIBILITY.md) | What Rone Arena can and can't do, with evidence |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and key decisions |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Tables, RLS, functions |

## Stack
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth) · Zod · Vitest + PGlite · Vercel

## Quick start (local, demo data)

Requires Node 20.9+.

```bash
npm install
cp .env.example .env.local     # then fill in Supabase values and secrets (see below)
npm run dev
```

With `MLBB_PROVIDER=mock`, account linking works for any Game ID with the code **`0000`**. All mock data is labeled DEMO and never appears on the leaderboard.

Generate each secret with `openssl rand -base64 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

## Supabase setup (one-time)

1. **Create a project** at <https://supabase.com>. Under Project Settings → API, copy the URL, the publishable (anon) key, and the secret (service_role) key into `.env.local`.
2. **Apply the migrations** in filename order from `supabase/migrations/`:
   - Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, **or**
   - Dashboard → SQL Editor: paste and run each file in order.
3. **Auth URLs:** Authentication → URL Configuration
   - Site URL: your production URL
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://<your-domain>/auth/callback`
4. **Google login** (optional):
   - Google Cloud Console → Credentials → OAuth client (Web). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Supabase → Authentication → Providers → Google: paste the client ID and secret.
5. **First admin:** sign up in the app, then run in the SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where username = '<your-username>';
   ```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | All tests: rank decoding, HTTP client, crypto, migrations + RLS (PGlite), services end to end |
| `npm run check` | Type-check + lint + tests |
| `npm run translations:status` | Compare live English game text with our Mongolian translations; exits 1 if any are outdated (patch) or missing. `-- --show` prints source + hash |
| `npm run provider:probe` | **Real** end-to-end Rone Arena check with your own MLBB account |

The DB tests run the real migrations in PGlite (Postgres in WASM), with a stub for Supabase's `auth` schema and roles. No Docker needed.

## Deploying to Vercel

1. Import the repo into Vercel.
2. Set every variable from `.env.example` for Production (and Preview). Use `MLBB_PROVIDER=rone_arena` in Production; the app refuses `mock` when `VERCEL_ENV=production`.
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL. API routes reject requests whose `Origin` doesn't match it.
4. `vercel.json` schedules `/api/cron/sync-ranks` daily (20:00 UTC = 04:00 Ulaanbaatar). The Hobby plan allows only daily cron; on Pro, make it more frequent. Each run only processes accounts whose `next_sync_at` is due, so this is safe.
5. Add the production callback URL to Supabase (step 3 above).

## Before launch — actions for the project owner

- [ ] Run `npm run provider:probe` with your own account and share the redacted output
- [ ] If the site will be monetized (ads, sponsors, paid features), contact RoneAI at `hello@rone.dev`. Their hosted API terms make commercial use "by arrangement".
- [ ] Review the consent text on the link-account page with whoever handles privacy/legal

## Notes

- **OneDrive:** this folder is synced by OneDrive, which will try to sync `node_modules` and `.next` (hundreds of MB, many small files). Consider moving the project outside OneDrive, or excluding those folders.
- Data: player and hero data via [Rone Arena](https://arena.rone.dev), an unofficial community API. Not affiliated with Moonton.
