import { isProviderError, type MlbbProvider, type ProviderErrorKind } from "@/lib/mlbb/provider";
import type { DataSource, PlayerProfile } from "@/lib/mlbb/types";

export interface SyncStore {
  claimJob(kind: "rank_sync", triggeredBy: "cron" | "admin" | "user"): Promise<string | null>;
  finishJob(jobId: string, counts: { processed: number; succeeded: number; failed: number }, error?: string): Promise<void>;
  dueAccounts(limit: number): Promise<{ accountId: string; encryptedToken: string }[]>;
  accountToken(accountId: string): Promise<string | null>;
  recordSuccess(input: {
    accountId: string;
    jobId: string | null;
    profile: PlayerProfile;
    dataSource: DataSource;
    nextSyncAt: Date;
  }): Promise<{ snapshotWritten: boolean }>;
  recordFailure(input: { accountId: string; jobId: string | null; kind: ProviderErrorKind; message: string }): Promise<void>;
}

export interface SyncDeps {
  provider: MlbbProvider;
  store: SyncStore;
  decrypt: (payload: string) => string;
  intervalHours: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export type AccountSyncResult =
  | { ok: true; snapshotWritten: boolean; profile: PlayerProfile }
  | { ok: false; kind: ProviderErrorKind };

/** Fetch one account's profile and record the outcome. Never throws for provider errors. */
export async function syncAccount(
  account: { accountId: string; encryptedToken: string },
  jobId: string | null,
  deps: SyncDeps,
): Promise<AccountSyncResult> {
  const now = deps.now ?? Date.now;
  try {
    const token = deps.decrypt(account.encryptedToken);
    const profile = await deps.provider.getPlayerProfile(token);
    const { snapshotWritten } = await deps.store.recordSuccess({
      accountId: account.accountId,
      jobId,
      profile,
      dataSource: deps.provider.dataSource,
      nextSyncAt: new Date(now() + deps.intervalHours * 3_600_000),
    });
    return { ok: true, snapshotWritten, profile };
  } catch (error) {
    const kind: ProviderErrorKind = isProviderError(error) ? error.kind : "unknown";
    const message = isProviderError(error) ? error.message : "Unexpected sync error";
    await deps.store.recordFailure({ accountId: account.accountId, jobId, kind, message });
    return { ok: false, kind };
  }
}

export interface RankSyncOptions {
  triggeredBy: "cron" | "admin";
  batchSize: number;
  requestDelayMs: number;
  timeBudgetMs: number;
}

export type RankSyncReport =
  | { status: "skipped"; reason: "already_running" }
  | { status: "completed"; jobId: string; processed: number; succeeded: number; failed: number; stoppedEarly: boolean };

/** One scheduled pass over due accounts, paced and bounded by a time budget. */
export async function runRankSync(options: RankSyncOptions, deps: SyncDeps): Promise<RankSyncReport> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + options.timeBudgetMs;

  const jobId = await deps.store.claimJob("rank_sync", options.triggeredBy);
  if (!jobId) return { status: "skipped", reason: "already_running" };

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let stoppedEarly = false;
  try {
    const accounts = await deps.store.dueAccounts(options.batchSize);
    for (const [index, account] of accounts.entries()) {
      if (now() >= deadline) {
        stoppedEarly = true;
        break;
      }
      const result = await syncAccount(account, jobId, deps);
      processed++;
      if (result.ok) succeeded++;
      else failed++;
      // Provider asked us to slow down: stop this run and let the next one continue.
      if (!result.ok && result.kind === "rate_limited") {
        stoppedEarly = true;
        break;
      }
      if (index < accounts.length - 1 && options.requestDelayMs > 0) await sleep(options.requestDelayMs);
    }
    await deps.store.finishJob(jobId, { processed, succeeded, failed });
  } catch (error) {
    await deps.store.finishJob(jobId, { processed, succeeded, failed }, error instanceof Error ? error.message : String(error));
    throw error;
  }
  return { status: "completed", jobId, processed, succeeded, failed, stoppedEarly };
}
