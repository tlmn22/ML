import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataSource } from "@/lib/mlbb/types";

export interface LinkedAccount {
  id: string;
  profileId: string;
  roleId: number;
  zoneId: number;
  nickname: string | null;
  avatarUrl: string | null;
  level: number | null;
  verificationMethod: "provider_code" | "manual";
  dataSource: DataSource;
  status: "active" | "reauth_required";
  verifiedAt: string;
  currentRankLevel: number | null;
  highestRankLevel: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: "ok" | "error" | "reauth_required" | null;
}

export interface Snapshot {
  rankLevel: number;
  highestRankLevel: number | null;
  source: DataSource;
  capturedAt: string;
}

const ACCOUNT_COLUMNS =
  "id, profile_id, role_id, zone_id, nickname, avatar_url, level, verification_method, data_source, status, verified_at, current_rank_level, highest_rank_level, last_synced_at, last_sync_status";

type AccountRow = {
  id: string;
  profile_id: string;
  role_id: number;
  zone_id: number;
  nickname: string | null;
  avatar_url: string | null;
  level: number | null;
  verification_method: LinkedAccount["verificationMethod"];
  data_source: DataSource;
  status: LinkedAccount["status"];
  verified_at: string;
  current_rank_level: number | null;
  highest_rank_level: number | null;
  last_synced_at: string | null;
  last_sync_status: LinkedAccount["lastSyncStatus"];
};

function toAccount(r: AccountRow): LinkedAccount {
  return {
    id: r.id,
    profileId: r.profile_id,
    roleId: Number(r.role_id),
    zoneId: r.zone_id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    level: r.level,
    verificationMethod: r.verification_method,
    dataSource: r.data_source,
    status: r.status,
    verifiedAt: r.verified_at,
    currentRankLevel: r.current_rank_level,
    highestRankLevel: r.highest_rank_level,
    lastSyncedAt: r.last_synced_at,
    lastSyncStatus: r.last_sync_status,
  };
}

/** Reads go through whichever client is passed, so RLS decides visibility. */
export async function getAccountByProfile(db: SupabaseClient, profileId: string): Promise<LinkedAccount | null> {
  const { data, error } = await db.from("mlbb_accounts").select(ACCOUNT_COLUMNS).eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error(`load account failed: ${error.message}`);
  return data ? toAccount(data as AccountRow) : null;
}

export async function getSnapshots(db: SupabaseClient, accountId: string, limit = 120): Promise<Snapshot[]> {
  const { data, error } = await db
    .from("rank_snapshots")
    .select("rank_level, highest_rank_level, source, captured_at")
    .eq("account_id", accountId)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`load snapshots failed: ${error.message}`);
  return (data ?? [])
    .map((r) => ({
      rankLevel: r.rank_level,
      highestRankLevel: r.highest_rank_level,
      source: r.source as DataSource,
      capturedAt: r.captured_at,
    }))
    .reverse();
}
