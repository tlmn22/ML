import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, createUser } from "../db/harness";
import { pgliteRpcClient } from "./pglite-rpc";
import { MockMlbbProvider, MOCK_VERIFICATION_CODE } from "@/lib/mlbb/mock/provider";
import { ProviderError, type MlbbProvider } from "@/lib/mlbb/provider";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { supabaseSyncStore, supabaseVerificationStore } from "@/lib/services/supabase-stores";
import { completeVerification, startVerification, type VerificationDeps } from "@/lib/services/verification";
import { runRankSync, syncAccount, type SyncDeps } from "@/lib/services/rank-sync";

const key = randomBytes(32).toString("base64");
let db: PGlite;
let provider: MockMlbbProvider;
let verificationDeps: VerificationDeps;
let syncDeps: SyncDeps;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.exec(`truncate auth.users, public.sync_jobs, public.audit_logs cascade`);
  provider = new MockMlbbProvider();
  const rpc = pgliteRpcClient(db);
  verificationDeps = {
    provider,
    store: supabaseVerificationStore(rpc),
    encrypt: (s) => encryptSecret(s, key),
    syncIntervalHours: 12,
  };
  syncDeps = {
    provider,
    store: supabaseSyncStore(rpc),
    decrypt: (s) => decryptSecret(s, key),
    intervalHours: 12,
    sleep: async () => {},
  };
});

const account = { roleId: 987654321, zoneId: 4321 };

async function link(profileId: string, deps = verificationDeps) {
  const { attemptId } = await startVerification({ ...account, profileId, ipHash: null }, deps);
  return completeVerification({ profileId, attemptId, code: MOCK_VERIFICATION_CODE }, deps);
}

describe("verification service", () => {
  it("links an account end to end and stores only an encrypted token", async () => {
    const profileId = await createUser(db, "player@example.com");
    const result = await link(profileId);

    expect(result.profile).toMatchObject(account);
    const { rows: sessions } = await db.query<{ encrypted_token: string }>(
      `select encrypted_token from public.mlbb_provider_sessions`,
    );
    expect(sessions[0].encrypted_token).not.toContain("mock-session");
    expect(decryptSecret(sessions[0].encrypted_token, key)).toContain("mock-session");

    const { rows: attempts } = await db.query<{ status: string; evidence: Record<string, unknown> }>(
      `select status, evidence from public.mlbb_verification_attempts`,
    );
    expect(attempts[0].status).toBe("verified");
    expect(attempts[0].evidence).toMatchObject({
      provider: "mock",
      data_source: "mock",
      login_role_id: account.roleId,
      profile_role_id: account.roleId,
    });
    expect(JSON.stringify(attempts[0].evidence)).not.toContain("mock-session");

    const { rows: snaps } = await db.query<{ source: string }>(`select source from public.rank_snapshots`);
    expect(snaps).toEqual([{ source: "mock" }]);
  });

  it("lets the player retry a wrong code, then succeed", async () => {
    const profileId = await createUser(db, "typo@example.com");
    const { attemptId } = await startVerification({ ...account, profileId, ipHash: null }, verificationDeps);
    await expect(completeVerification({ profileId, attemptId, code: "9999" }, verificationDeps)).rejects.toMatchObject({
      code: "invalid_code",
    });
    await expect(
      completeVerification({ profileId, attemptId, code: MOCK_VERIFICATION_CODE }, verificationDeps),
    ).resolves.toMatchObject({ transferred: false });
  });

  it("refuses to verify when the provider session belongs to a different account", async () => {
    const profileId = await createUser(db, "mismatch@example.com");
    const liar: MlbbProvider = Object.assign(Object.create(provider), {
      getPlayerProfile: async () => ({ ...(await provider.getPlayerProfile(`mock-session:1:1`)) }),
    });
    await expect(link(profileId, { ...verificationDeps, provider: liar })).rejects.toMatchObject({
      code: "identity_mismatch",
    });
    expect((await db.query(`select * from public.mlbb_accounts`)).rows).toHaveLength(0);
    const { rows } = await db.query<{ status: string; failure_reason: string }>(
      `select status, failure_reason from public.mlbb_verification_attempts`,
    );
    expect(rows[0]).toEqual({ status: "failed", failure_reason: "identity_mismatch:profile" });
  });

  it("closes the attempt when sending the code fails", async () => {
    const profileId = await createUser(db, "down@example.com");
    const down: MlbbProvider = Object.assign(Object.create(provider), {
      requestVerificationCode: async () => {
        throw new ProviderError("unavailable", "down");
      },
    });
    await expect(
      startVerification({ ...account, profileId, ipHash: null }, { ...verificationDeps, provider: down }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    const { rows } = await db.query<{ status: string }>(`select status from public.mlbb_verification_attempts`);
    expect(rows).toEqual([{ status: "failed" }]);
  });

  it("enforces the per-account rate limit", async () => {
    const profileId = await createUser(db, "spam@example.com");
    for (let i = 0; i < 3; i++) await startVerification({ ...account, profileId, ipHash: null }, verificationDeps);
    await expect(
      startVerification({ ...account, profileId, ipHash: null }, verificationDeps),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("rejects codes for an expired attempt", async () => {
    const profileId = await createUser(db, "slow@example.com");
    const { attemptId } = await startVerification({ ...account, profileId, ipHash: null }, verificationDeps);
    await db.query(`update public.mlbb_verification_attempts set expires_at = now() - interval '1 second'`);
    await expect(
      completeVerification({ profileId, attemptId, code: MOCK_VERIFICATION_CODE }, verificationDeps),
    ).rejects.toMatchObject({ code: "attempt_expired" });
  });
});

describe("rank sync service", () => {
  it("syncs due accounts, writes a snapshot on rank change, and reschedules", async () => {
    const profileId = await createUser(db, "climber@example.com");
    await link(profileId);
    await db.query(`update public.mlbb_accounts set next_sync_at = now() - interval '1 minute'`);
    provider.rankDrift = 2;

    const report = await runRankSync(
      { triggeredBy: "cron", batchSize: 10, requestDelayMs: 0, timeBudgetMs: 60_000 },
      syncDeps,
    );
    expect(report).toMatchObject({ status: "completed", processed: 1, succeeded: 1, failed: 0 });

    const { rows: snaps } = await db.query(`select * from public.rank_snapshots`);
    expect(snaps).toHaveLength(2);
    const { rows: jobs } = await db.query<{ status: string; succeeded: number }>(
      `select status, succeeded from public.sync_jobs`,
    );
    expect(jobs).toEqual([{ status: "succeeded", succeeded: 1 }]);
    const { rows: due } = await db.query(`select * from public.mlbb_due_sync_accounts(10)`);
    expect(due).toHaveLength(0);
  });

  it("skips when another sync is already running", async () => {
    await db.query(`select public.claim_sync_job('rank_sync', 'cron')`);
    await expect(
      runRankSync({ triggeredBy: "cron", batchSize: 10, requestDelayMs: 0, timeBudgetMs: 60_000 }, syncDeps),
    ).resolves.toEqual({ status: "skipped", reason: "already_running" });
  });

  it("marks the account for re-verification when the session expired", async () => {
    const profileId = await createUser(db, "expired@example.com");
    const { accountId } = await link(profileId);
    const expired = { accountId, encryptedToken: encryptSecret("not-a-mock-session", key) };
    await expect(syncAccount(expired, null, syncDeps)).resolves.toEqual({ ok: false, kind: "unauthorized" });
    const { rows } = await db.query<{ status: string }>(`select status from public.mlbb_accounts`);
    expect(rows).toEqual([{ status: "reauth_required" }]);
  });
});
