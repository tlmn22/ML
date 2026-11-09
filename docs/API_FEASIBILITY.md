# Rone Arena API — Feasibility Report

Research date: **2026-11-05**
API version inspected: **Rone Arena API 1.6.2** (`https://arena.rone.dev/api/openapi.json`, identical on mirror `https://arena.fastapicloud.dev`)
Source: <https://github.com/ridwaanhall/rone-arena-api> (BSD-3-Clause, last push 2026-10-25)
Hosted terms: `HOSTED_API_TERMS.md` in the repository above

## Verdict

**Verified MLBB player rank retrieval is technically feasible, but not yet proven end-to-end.**

The API documents an ownership-proof flow that matches what the product needs: the player enters Role ID + Zone ID, the game sends a 4-digit code to the player's **in-game mail**, the player submits it, and the API returns a JWT that unlocks `/api/user/info` (which includes `rank_level` and `history_rank_level`).

What has been confirmed live: the endpoints exist, they validate input, and they reject missing/invalid JWTs.
What has **not** been confirmed: a real successful `send-vc → login → info` round trip. That requires the owner of a real MLBB account to receive the in-game code. Until that happens, the integration must be treated as unverified. A script (`npm run provider:probe`) is included so the project owner can run this test with their own account.

## How evidence was gathered

| Method | What it shows |
|---|---|
| Downloaded OpenAPI schema from both hosts | 66 operations, request/response schemas, documented examples |
| Live `GET` calls to public endpoints | Endpoints respond with `code: 0` and real data |
| Live calls to user endpoints with **invalid** inputs only | Validation and auth errors are real (no mail was sent to any player) |
| Read source (`schemas/user.py`, `routers/user.py`, `core/config.py`) | Field types, upstream proxying, failover behavior |
| Read hosted terms | Usage restrictions that shape the design |

No verification code was requested for any account. Doing so against an account we don't own would spam a real player's in-game mail and violate the terms.

---

## 1. Confirmed capabilities

"Confirmed" means a live request returned the described behavior on 2026-11-05.

### Public data (no key, no sign-up)

| Endpoint | Live result | Product use |
|---|---|---|
| `GET /api/heroes` | 200, `total: 133` heroes, id/name/head image, relations | Hero directory |
| `GET /api/heroes/rank?days=7&rank=all` | 200, per hero `main_hero_win_rate`, `main_hero_appearance_rate`, `main_hero_ban_rate`, synergy `sub_hero` | Win / pick / ban rate, tier list input |
| `GET /api/academy/ranks` | 200, 29 rank bands with `rankid_start`/`rankid_end` and emblem `icon` | Decoding rank levels, rank emblems |
| `GET /api/academy/ranks/{rank_id}` (≤ 9999) | 200, returns the band containing that value (e.g. `120` → Legend III, `300` → Mythical Immortal) | Rank decoding check |
| `GET /api/academy/meta/version` | 200, game versions (latest `2.1.18`) | Patch label on hero stats |

Responses carry `Cache-Control: public, max-age=300, stale-while-revalidate=60`. No rate-limit headers are sent.

### User endpoints — existence and error behavior

| Probe | Result |
|---|---|
| `POST /api/user/auth/send-vc` with `{}` | `422 VALIDATION_ERROR` — `role_id`, `zone_id` required |
| `POST /api/user/auth/login` with non-integers | `422` — `role_id`, `zone_id`, `vc` must be integers |
| `GET /api/user/info` without `Authorization` | `401 UNAUTHORIZED` "Authorization header is required" |
| `GET /api/user/info` with a fake JWT | `401 UPSTREAM_REQUEST_FAILED` |

The last row matters: an invalid or expired JWT produces **HTTP 401**, which is how the app detects that a player must re-verify.

### Error envelope (confirmed)

```json
{ "status": "error", "code": "VALIDATION_ERROR", "message": "...", "timestamp": "...", "details": [...] }
```

Success envelopes vary by endpoint: `{code, data, msg}` (auth/info) or `{code, message, data, traceID}` (stats, academy). The client validates both shapes.

---

## 2. Documented but unverified

These come from the OpenAPI schema and source code. They are probably accurate, but no real authenticated response has been seen.

| # | Assumption | Source | Risk if wrong | How the app handles it |
|---|---|---|---|---|
| U1 | `send-vc` delivers a 4-digit code to in-game mail, valid 5 minutes | Schema docs | Linking flow fails | Errors are surfaced; the manual fallback stays available |
| U2 | `login` returns `data.jwt`, `data.roleid`, `data.zoneid` | Schema example | Linking flow fails | Response validated with Zod; a mismatch is logged as a provider error |
| U3 | `/api/user/info` returns `rank_level`, `history_rank_level`, `name`, `avatar`, `reg_country`, `roleId`, `zoneId` | Schema example | Dashboard is empty | Fields are optional in the schema; missing values render as "unavailable" |
| U4 | `rank_level` uses the same scale as `/api/academy/ranks` (cumulative 1–9999) | Inferred: the detail endpoint caps `rank_id` at 9999, and the documented example `rank_level: 8000` falls in that range | Ranks display wrong | Decoding is isolated in one function and covered by tests; the raw value is stored too, so history can be re-decoded later |
| U5 | Stars = `rank_level − band start` (e.g. Mythic stars = `rank_level − 136`) | Inferred from band widths: Warrior III has 4 values, Warrior II/I 3, Elite/Master 5, GM/Epic/Legend 6; Mythic thresholds 136/161/186/236 match the in-game 0/25/50/100★ | Star counts off by one in lower tiers | Same as U4. Mythic tiers are the most likely to be right, since their thresholds line up exactly |
| U6 | JWT lifetime | **Not documented** | Background sync stops working | The app treats any 401 as "re-verification needed" and records it |
| U7 | `reg_country` is `"MN"` for Mongolian accounts | Field documented, values not | Can't filter the leaderboard by country | The leaderboard uses opt-in platform members rather than a country filter |
| U8 | `/api/user/stats` returns lifetime W/L, MVP count, etc. | Schema example | Optional stats missing | Not in the MVP; planned for later |

## 3. Unsupported functionality

These are **not available** from Rone Arena. The product must not pretend otherwise.

| Requested feature | Status | Replacement in this project |
|---|---|---|
| Look up any player's rank by ID without their login | **Not available.** All player data requires the player's own JWT, and the terms forbid using it against other accounts | Only verified members' data is shown |
| Official Mongolia / server leaderboard | **Not available** | Leaderboard is built from our own timestamped snapshots of opted-in verified members. It is labeled as a "platform leaderboard", not an official ranking |
| Historical rank history from the provider | **Not available** (only current + highest) | History comes from our own snapshots, starting on the day each account is linked |
| Weekly rank change | **Not available** directly | Calculated from our own snapshots, shown only when a snapshot exists from ≥ 7 days earlier |
| Patch notes text | **Not available** (only version numbers) | Admin-written patch notes in the CMS |
| News | **Not available** | Admin CMS |
| Stars as a separate field | **Not available** | Derived from `rank_level` (U5) |
| Webhooks / push on rank change | **Not available** | Scheduled polling |

---

## 4. Constraints from the hosted terms

These shape the architecture directly:

1. **"Player-facing endpoints require the player's own authentication. Do not use them against accounts that are not yours."** We only call user endpoints with a JWT the player obtained by entering their own in-game code. We never collect or replay codes for others.
2. **No SLA. Endpoints may be rate limited, moved, or withdrawn.** All provider calls have timeouts, bounded retries, and cached fallbacks. Hero data is cached in our database so pages work during outages.
3. **On 503, read `alternative_endpoint`** from the body instead of hard-coding a failover host. The client does this, and only accepts hosts on a configured allow-list.
4. **"Do not send traffic that degrades the service."** Sync is batched, scheduled, and configurable. Hero stats are refreshed at most every few hours.
5. **Commercial use is "by arrangement".** ⚠️ **Action required:** if ML Mongolia will carry ads, sponsorships, or paid features, contact `hello@rone.dev` before launch.
6. **Attribution is requested.** The footer and hero pages credit "Data: Rone Arena" with a link to <https://arena.rone.dev>.
7. **Third-party data path.** The player's MLBB JWT passes through Rone Arena's servers, which proxy to Moonton's upstream. Users must be told this before they link. The consent text on the linking page says so.

## 5. Security notes on the provider JWT

- The login JWT gives read access to the player's battle reports **and** lets the holder change their privacy settings (`POST /api/user/privacy/settings`). Treat it as a credential.
- It is stored only server-side, encrypted with AES-256-GCM (`PROVIDER_TOKEN_ENCRYPTION_KEY`), in a table with RLS enabled, no policies, and grants revoked from `anon` and `authenticated`.
- The provider integration only calls read endpoints plus logout. It never calls the privacy update endpoint.
- On unlink or account deletion we call `logout` (best effort), then delete the stored token.

## 6. Manual verification fallback

If the in-game code flow fails (provider outage, U1/U2 turn out wrong), users can submit a **manual verification request**. An admin reviews it and approves or rejects it.

- Manually verified accounts carry `verification_method = 'manual'` and show a distinct badge.
- They have **no provider token**, so they are never auto-synced.
- An admin can attach a rank snapshot with `source = 'admin_manual'`. It is labeled as manually entered everywhere it appears.
- The leaderboard always excludes manually verified accounts (enforced in the `leaderboard_entries` view), because their rank can't be refreshed from the provider.

## 7. Feature dependency matrix

| Feature | Depends on | Status |
|---|---|---|
| Hero directory, images | Public `/api/heroes` | ✅ Confirmed |
| Win / pick / ban rates, tier list | Public `/api/heroes/rank` | ✅ Confirmed |
| Counters, compatibility, builds | Public `/api/heroes/{id}/counters` etc. | 📄 Documented, not yet probed |
| Rank emblems, rank names | Public `/api/academy/ranks` | ✅ Confirmed |
| Account linking via in-game code | `send-vc`, `login` | ⚠️ Unverified (U1, U2) |
| Current / highest rank | `/api/user/info` | ⚠️ Unverified (U3–U5) |
| Background rank sync | Stored JWT stays valid | ⚠️ Unknown (U6) |
| Rank history, weekly change | Our snapshots | ✅ Ours, no provider dependency |
| Leaderboard | Our snapshots | ✅ Ours, quality depends on sync |
| News, patch notes, guides | Our CMS | ✅ Ours |

## 8. Contract tests

`tests/fixtures/rone-arena/ranks.json` is a snapshot of the live rank bands. `tests/unit/ranks.test.ts` fails if our rank table drifts from it. `tests/unit/rone-arena.test.ts` replays the documented response examples and the live error envelopes through the real client. When the probe below produces a real `/user/info` response, add it (redacted) as a fixture too.

## 9. Proving the integration (action for the project owner)

Run this with **your own** MLBB account:

```bash
npm run provider:probe
```

It asks for your Role ID and Zone ID, sends a code to your in-game mail, asks you to type it, then calls `/api/user/info` and prints the response **with the JWT redacted**. It also prints the decoded rank so you can compare it with what the game shows.

Please send back: (1) whether the mail arrived, (2) the redacted output, (3) your actual in-game rank and stars at that moment. That resolves U1–U5 and lets us mark the integration as working.
