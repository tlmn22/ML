import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountByProfile, getSnapshots, type LinkedAccount, type Snapshot } from "./accounts";

export interface PublicPlayer {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  memberSince: string;
  /** Null when not linked or when the player hasn't opted in (RLS hides it). */
  account: LinkedAccount | null;
  snapshots: Snapshot[];
}

export const playerTag = (username: string) => `player:${username}`;

/** What the public may see about a player. Uses the anonymous client, so RLS enforces opt-in. */
export async function getPublicPlayer(username: string): Promise<PublicPlayer | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(playerTag(username));

  if (!isSupabaseConfigured() || !/^[a-z0-9_]{3,20}$/.test(username)) return null;
  const db = createPublicClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, username, display_name, avatar_url, created_at")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return null;

  const account = await getAccountByProfile(db, profile.id);
  const snapshots = account ? await getSnapshots(db, account.id, 90) : [];
  return {
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    memberSince: profile.created_at,
    account,
    snapshots,
  };
}
