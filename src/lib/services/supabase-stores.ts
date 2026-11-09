import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncStore } from "./rank-sync";
import type { VerificationStore } from "./verification";

/** Thin adapters from the service interfaces to the SQL functions in supabase/migrations. */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, op: string): T {
  if (result.error) throw new Error(`${op} failed: ${result.error.message}`);
  return result.data as T;
}

export function supabaseVerificationStore(db: SupabaseClient): VerificationStore {
  return {
    async startCodeAttempt({ profileId, roleId, zoneId, ipHash }) {
      const rows = unwrap<{ out_attempt_id: string | null; out_error: string | null }[]>(
        await db.rpc("mlbb_start_code_attempt", {
          p_profile_id: profileId,
          p_role_id: roleId,
          p_zone_id: zoneId,
          p_ip_hash: ipHash,
        }),
        "mlbb_start_code_attempt",
      );
      const row = rows[0];
      if (!row?.out_attempt_id) return { error: "rate_limited" };
      return { attemptId: row.out_attempt_id };
    },

    async beginCodeSubmission(attemptId, profileId) {
      const rows = unwrap<{ out_status: string; out_role_id: number | null; out_zone_id: number | null }[]>(
        await db.rpc("mlbb_begin_code_submission", { p_attempt_id: attemptId, p_profile_id: profileId }),
        "mlbb_begin_code_submission",
      );
      const row = rows[0];
      if (row?.out_status === "ok" && row.out_role_id && row.out_zone_id) {
        return { status: "ok", roleId: Number(row.out_role_id), zoneId: row.out_zone_id };
      }
      const status = row?.out_status;
      return { status: status === "expired" || status === "too_many" || status === "closed" ? status : "not_found" };
    },

    async failAttempt(attemptId, reason, terminal) {
      unwrap(
        await db.rpc("mlbb_fail_attempt", { p_attempt_id: attemptId, p_reason: reason, p_terminal: terminal }),
        "mlbb_fail_attempt",
      );
    },

    async finalizeVerification({ attemptId, profileId, profile, encryptedToken, dataSource, evidence, nextSyncAt }) {
      const rows = unwrap<{ out_account_id: string; out_transferred_from: string | null }[]>(
        await db.rpc("mlbb_finalize_verification", {
          p_attempt_id: attemptId,
          p_profile_id: profileId,
          p_nickname: profile.nickname,
          p_avatar_url: profile.avatarUrl,
          p_reg_country: profile.regCountry,
          p_level: profile.level,
          p_rank_level: profile.rankLevel,
          p_highest_rank_level: profile.highestRankLevel,
          p_encrypted_token: encryptedToken,
          p_data_source: dataSource,
          p_evidence: evidence,
          p_next_sync_at: nextSyncAt.toISOString(),
        }),
        "mlbb_finalize_verification",
      );
      return { accountId: rows[0].out_account_id, transferredFrom: rows[0].out_transferred_from };
    },
  };
}

export function supabaseSyncStore(db: SupabaseClient): SyncStore {
  return {
    async claimJob(kind, triggeredBy) {
      return unwrap<string | null>(
        await db.rpc("claim_sync_job", { p_kind: kind, p_triggered_by: triggeredBy }),
        "claim_sync_job",
      );
    },

    async finishJob(jobId, { processed, succeeded, failed }, error) {
      unwrap(
        await db.rpc("finish_sync_job", {
          p_job_id: jobId,
          p_processed: processed,
          p_succeeded: succeeded,
          p_failed: failed,
          p_error: error ?? null,
        }),
        "finish_sync_job",
      );
    },

    async dueAccounts(limit) {
      const rows = unwrap<{ out_account_id: string; out_encrypted_token: string }[]>(
        await db.rpc("mlbb_due_sync_accounts", { p_limit: limit }),
        "mlbb_due_sync_accounts",
      );
      return rows.map((r) => ({ accountId: r.out_account_id, encryptedToken: r.out_encrypted_token }));
    },

    async accountToken(accountId) {
      return unwrap<string | null>(await db.rpc("mlbb_account_token", { p_account_id: accountId }), "mlbb_account_token");
    },

    async recordSuccess({ accountId, jobId, profile, dataSource, nextSyncAt }) {
      const snapshotWritten = unwrap<boolean>(
        await db.rpc("mlbb_record_sync_success", {
          p_account_id: accountId,
          p_job_id: jobId,
          p_nickname: profile.nickname,
          p_avatar_url: profile.avatarUrl,
          p_reg_country: profile.regCountry,
          p_level: profile.level,
          p_rank_level: profile.rankLevel,
          p_highest_rank_level: profile.highestRankLevel,
          p_data_source: dataSource,
          p_next_sync_at: nextSyncAt.toISOString(),
        }),
        "mlbb_record_sync_success",
      );
      return { snapshotWritten };
    },

    async recordFailure({ accountId, jobId, kind, message }) {
      unwrap(
        await db.rpc("mlbb_record_sync_failure", {
          p_account_id: accountId,
          p_job_id: jobId,
          p_error_kind: kind,
          p_error_message: message,
        }),
        "mlbb_record_sync_failure",
      );
    },
  };
}
