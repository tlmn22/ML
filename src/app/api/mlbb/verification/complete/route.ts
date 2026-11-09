import { revalidateTag } from "next/cache";
import { guardJsonRoute, jsonError, jsonOk } from "@/lib/http";
import { decodeRankLevel } from "@/lib/mlbb/ranks";
import { LEADERBOARD_TAG } from "@/lib/services/leaderboard";
import { verificationDeps } from "@/lib/services/runtime";
import { completeVerification, VerificationError } from "@/lib/services/verification";
import { completeVerificationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const guard = await guardJsonRoute(request, completeVerificationSchema);
  if (!guard.ok) return guard.response;

  try {
    const result = await completeVerification(
      { profileId: guard.userId, attemptId: guard.body.attemptId, code: guard.body.code },
      verificationDeps(),
    );
    revalidateTag(LEADERBOARD_TAG, "max");
    return jsonOk({
      transferred: result.transferred,
      nickname: result.profile.nickname,
      rank: decodeRankLevel(result.profile.rankLevel)?.label ?? null,
    });
  } catch (error) {
    if (error instanceof VerificationError) {
      const status =
        error.code === "provider_unavailable" ? 503 : error.code === "too_many_submissions" ? 429 : 400;
      if (error.code === "provider_error" || error.code === "identity_mismatch") {
        console.error(`verification.complete ${error.code}`, error.message);
      }
      return jsonError(error.code, status);
    }
    console.error("verification.complete failed", error);
    return jsonError("provider_error", 500);
  }
}
