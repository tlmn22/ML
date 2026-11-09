import { getServerEnv } from "@/lib/env";
import { guardJsonRoute, jsonError, jsonOk } from "@/lib/http";
import { hashIp } from "@/lib/security/crypto";
import { clientIp } from "@/lib/security/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { manualVerificationSchema } from "@/lib/validation";

/** Fallback: ask an admin to verify ownership when the in-game code flow is unavailable. */
export async function POST(request: Request) {
  const guard = await guardJsonRoute(request, manualVerificationSchema);
  if (!guard.ok) return guard.response;

  const { data, error } = await createAdminClient().rpc("mlbb_submit_manual_request", {
    p_profile_id: guard.userId,
    p_role_id: guard.body.roleId,
    p_zone_id: guard.body.zoneId,
    p_note: guard.body.note,
    p_ip_hash: hashIp(clientIp(request.headers), getServerEnv().IP_HASH_SALT),
  });
  if (error) {
    console.error("manual verification request failed", error.message);
    return jsonError("provider_error", 500);
  }
  const row = (data as { out_attempt_id: string | null; out_error: string | null }[])[0];
  if (!row?.out_attempt_id) return jsonError(row?.out_error ?? "rate_limited", 429);
  return jsonOk({ requestId: row.out_attempt_id }, 201);
}
