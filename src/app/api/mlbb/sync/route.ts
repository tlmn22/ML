import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { guardJsonRoute, jsonError, jsonOk } from "@/lib/http";
import { LEADERBOARD_TAG } from "@/lib/services/leaderboard";
import { syncAccount } from "@/lib/services/rank-sync";
import { syncDeps } from "@/lib/services/runtime";
import { createAdminClient } from "@/lib/supabase/admin";

/** A player refreshes their own rank, at most once per cooldown window. */
export async function POST(request: Request) {
  const guard = await guardJsonRoute(request, z.object({}).loose());
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("mlbb_accounts")
    .select("id, status, verification_method, last_synced_at")
    .eq("profile_id", guard.userId)
    .maybeSingle();

  if (!account) return jsonError("no_account", 404);
  if (account.verification_method !== "provider_code") return jsonError("not_syncable", 400);
  if (account.status === "reauth_required") return jsonError("reauth_required", 409);

  const cooldownMs = getServerEnv().USER_SYNC_COOLDOWN_MINUTES * 60_000;
  if (account.last_synced_at && Date.now() - new Date(account.last_synced_at).getTime() < cooldownMs) {
    return jsonError("cooldown", 429);
  }

  const deps = syncDeps();
  const encryptedToken = await deps.store.accountToken(account.id);
  if (!encryptedToken) return jsonError("reauth_required", 409);

  const result = await syncAccount({ accountId: account.id, encryptedToken }, null, deps);
  if (!result.ok) {
    if (result.kind === "unauthorized") return jsonError("reauth_required", 409);
    return jsonError("provider_unavailable", 503);
  }
  revalidateTag(LEADERBOARD_TAG, "max");
  return jsonOk({ snapshotWritten: result.snapshotWritten });
}
