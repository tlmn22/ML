import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { tierRange, type RankTier } from "@/lib/mlbb/ranks";

export interface LeaderboardEntry {
  position: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  nickname: string | null;
  zoneId: number;
  rankLevel: number;
  highestRankLevel: number | null;
  status: "active" | "reauth_required";
  lastSyncedAt: string | null;
  weeklyChange: number | null;
}

export interface LeaderboardQuery {
  limit: 10 | 100;
  tier?: RankTier;
  search?: string;
}

export type LeaderboardResult =
  | { ok: true; entries: LeaderboardEntry[]; lastUpdated: string | null }
  | { ok: false };

export const LEADERBOARD_TAG = "leaderboard";

/** Public leaderboard read, cached briefly. Data comes from the `leaderboard_entries` view. */
export async function getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag(LEADERBOARD_TAG);

  if (!isSupabaseConfigured()) return { ok: false };
  let request = createPublicClient()
    .from("leaderboard_entries")
    .select("position, username, display_name, avatar_url, nickname, zone_id, rank_level, highest_rank_level, status, last_synced_at, weekly_change")
    .order("rank_level", { ascending: false })
    .order("last_synced_at", { ascending: false })
    .limit(query.limit);

  if (query.tier) {
    const { min, max } = tierRange(query.tier);
    request = request.gte("rank_level", min).lte("rank_level", max);
  }
  const search = query.search?.trim().replace(/[%_,()]/g, "");
  if (search) {
    request = request.or(`username.ilike.%${search}%,nickname.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  const { data, error } = await request;
  if (error) {
    console.error("leaderboard query failed", error.message);
    return { ok: false };
  }

  const entries: LeaderboardEntry[] = (data ?? []).map((r) => ({
    position: Number(r.position),
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    nickname: r.nickname,
    zoneId: r.zone_id,
    rankLevel: r.rank_level,
    highestRankLevel: r.highest_rank_level,
    status: r.status,
    lastSyncedAt: r.last_synced_at,
    weeklyChange: r.weekly_change,
  }));
  const lastUpdated = entries.reduce<string | null>(
    (max, e) => (e.lastSyncedAt && (!max || e.lastSyncedAt > max) ? e.lastSyncedAt : max),
    null,
  );
  return { ok: true, entries, lastUpdated };
}
