import { revalidateTag } from "next/cache";
import { getServerEnv } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";
import { safeEqual } from "@/lib/security/crypto";
import { LEADERBOARD_TAG } from "@/lib/services/leaderboard";
import { runRankSync } from "@/lib/services/rank-sync";
import { syncDeps } from "@/lib/services/runtime";

export const maxDuration = 60;

/** Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  // Reading the request first also keeps this handler out of build-time prerendering.
  const auth = request.headers.get("authorization") ?? "";
  const env = getServerEnv();
  if (!safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return jsonError("unauthorized", 401);

  try {
    const report = await runRankSync(
      {
        triggeredBy: "cron",
        batchSize: env.SYNC_BATCH_SIZE,
        requestDelayMs: env.SYNC_REQUEST_DELAY_MS,
        timeBudgetMs: Math.min(env.SYNC_TIME_BUDGET_MS, (maxDuration - 10) * 1000),
      },
      syncDeps(),
    );
    if (report.status === "completed" && report.succeeded > 0) revalidateTag(LEADERBOARD_TAG, "max");
    return jsonOk(report);
  } catch (error) {
    console.error("cron sync failed", error);
    return jsonError("sync_failed", 500);
  }
}
