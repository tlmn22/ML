import { getServerEnv } from "@/lib/env";
import { guardJsonRoute, jsonError, jsonOk } from "@/lib/http";
import { hashIp } from "@/lib/security/crypto";
import { clientIp } from "@/lib/security/request";
import { verificationDeps } from "@/lib/services/runtime";
import { startVerification, VerificationError } from "@/lib/services/verification";
import { startVerificationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const guard = await guardJsonRoute(request, startVerificationSchema);
  if (!guard.ok) return guard.response;

  const { roleId, zoneId } = guard.body;
  try {
    const result = await startVerification(
      {
        profileId: guard.userId,
        roleId,
        zoneId,
        ipHash: hashIp(clientIp(request.headers), getServerEnv().IP_HASH_SALT),
      },
      verificationDeps(),
    );
    return jsonOk(result);
  } catch (error) {
    if (error instanceof VerificationError) {
      const status = error.code === "rate_limited" ? 429 : error.code === "provider_unavailable" ? 503 : 400;
      if (error.code === "provider_error") console.error("verification.start provider error", error.message);
      return jsonError(error.code, status);
    }
    console.error("verification.start failed", error);
    return jsonError("provider_error", 500);
  }
}
