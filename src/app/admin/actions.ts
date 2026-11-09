"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { LEADERBOARD_TAG } from "@/lib/services/leaderboard";
import { runRankSync } from "@/lib/services/rank-sync";
import { syncDeps } from "@/lib/services/runtime";
import { createAdminClient } from "@/lib/supabase/admin";

const reviewSchema = z.object({
  attemptId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).default(""),
  rankLevel: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(9999).nullable()),
});

/** Every admin action re-checks the role on the server; never trust the page alone. */
export async function reviewManualRequest(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = reviewSchema.safeParse({
    attemptId: form.get("attemptId"),
    decision: form.get("decision"),
    note: form.get("note") ?? "",
    rankLevel: form.get("rankLevel") ?? "",
  });
  if (!parsed.success) return;

  const { error } = await createAdminClient().rpc("mlbb_review_manual_request", {
    p_attempt_id: parsed.data.attemptId,
    p_reviewer_id: admin.id,
    p_approve: parsed.data.decision === "approve",
    p_note: parsed.data.note,
    p_rank_level: parsed.data.rankLevel,
  });
  if (error) console.error("manual review failed", error.message);
  revalidatePath("/admin/verifications");
}

export async function triggerRankSync(): Promise<void> {
  await requireAdmin();
  const env = getServerEnv();
  const report = await runRankSync(
    {
      triggeredBy: "admin",
      batchSize: env.SYNC_BATCH_SIZE,
      requestDelayMs: env.SYNC_REQUEST_DELAY_MS,
      timeBudgetMs: Math.min(env.SYNC_TIME_BUDGET_MS, 50_000),
    },
    syncDeps(),
  );
  if (report.status === "completed") updateTag(LEADERBOARD_TAG);
  revalidatePath("/admin/sync");
}
