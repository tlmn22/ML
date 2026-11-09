import { isProviderError, type MlbbProvider } from "@/lib/mlbb/provider";
import type { DataSource, GameAccountId, PlayerProfile } from "@/lib/mlbb/types";

export const CODE_TTL_SECONDS = 5 * 60;

export type VerificationErrorCode =
  | "rate_limited"
  | "invalid_input"
  | "invalid_code"
  | "attempt_not_found"
  | "attempt_expired"
  | "too_many_submissions"
  | "identity_mismatch"
  | "provider_unavailable"
  | "provider_error";

export class VerificationError extends Error {
  constructor(
    readonly code: VerificationErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "VerificationError";
  }
}

export interface VerificationStore {
  startCodeAttempt(input: { profileId: string; roleId: number; zoneId: number; ipHash: string | null }): Promise<
    { attemptId: string } | { error: "rate_limited" }
  >;
  beginCodeSubmission(attemptId: string, profileId: string): Promise<
    { status: "ok"; roleId: number; zoneId: number } | { status: "not_found" | "closed" | "expired" | "too_many" }
  >;
  failAttempt(attemptId: string, reason: string, terminal: boolean): Promise<void>;
  finalizeVerification(input: {
    attemptId: string;
    profileId: string;
    profile: PlayerProfile;
    encryptedToken: string;
    dataSource: DataSource;
    evidence: Record<string, unknown>;
    nextSyncAt: Date;
  }): Promise<{ accountId: string; transferredFrom: string | null }>;
}

export interface VerificationDeps {
  provider: MlbbProvider;
  store: VerificationStore;
  encrypt: (plaintext: string) => string;
  syncIntervalHours: number;
  now?: () => Date;
}

function toVerificationError(error: unknown): VerificationError {
  if (error instanceof VerificationError) return error;
  if (isProviderError(error)) {
    switch (error.kind) {
      case "invalid_code":
        return new VerificationError("invalid_code");
      case "invalid_input":
        return new VerificationError("invalid_input");
      case "rate_limited":
        return new VerificationError("rate_limited");
      case "unavailable":
        return new VerificationError("provider_unavailable");
      default:
        return new VerificationError("provider_error", error.message);
    }
  }
  return new VerificationError("provider_error", String(error));
}

/** Step 1: rate-limit, record the attempt, then ask the game to mail a code. */
export async function startVerification(
  input: GameAccountId & { profileId: string; ipHash: string | null },
  deps: Pick<VerificationDeps, "provider" | "store">,
): Promise<{ attemptId: string; expiresInSeconds: number }> {
  const started = await deps.store.startCodeAttempt(input);
  if ("error" in started) throw new VerificationError("rate_limited");

  try {
    await deps.provider.requestVerificationCode({ roleId: input.roleId, zoneId: input.zoneId });
  } catch (error) {
    const mapped = toVerificationError(error);
    await deps.store.failAttempt(started.attemptId, `send_code:${mapped.code}`, true);
    throw mapped;
  }
  return { attemptId: started.attemptId, expiresInSeconds: CODE_TTL_SECONDS };
}

const sameAccount = (a: GameAccountId, b: GameAccountId) => a.roleId === b.roleId && a.zoneId === b.zoneId;

/**
 * Step 2: exchange the code for a provider session and prove identity.
 * The account is marked verified only if BOTH the login response and the
 * profile fetched with the new session name exactly the requested account.
 */
export async function completeVerification(
  input: { profileId: string; attemptId: string; code: string },
  deps: VerificationDeps,
): Promise<{ accountId: string; profile: PlayerProfile; transferred: boolean }> {
  const { provider, store } = deps;
  const now = deps.now ?? (() => new Date());

  const submission = await store.beginCodeSubmission(input.attemptId, input.profileId);
  if (submission.status !== "ok") {
    const map = {
      not_found: "attempt_not_found",
      closed: "attempt_not_found",
      expired: "attempt_expired",
      too_many: "too_many_submissions",
    } as const;
    throw new VerificationError(map[submission.status]);
  }
  const requested: GameAccountId = { roleId: submission.roleId, zoneId: submission.zoneId };

  let session;
  try {
    session = await provider.completeVerification(requested, input.code);
  } catch (error) {
    const mapped = toVerificationError(error);
    // A wrong code may be retried within the submission limit; other failures may be transient.
    await store.failAttempt(input.attemptId, `login:${mapped.code}`, false);
    throw mapped;
  }

  const rejectMismatch = async (stage: string) => {
    await provider.endSession(session.token).catch(() => undefined);
    await store.failAttempt(input.attemptId, `identity_mismatch:${stage}`, true);
    return new VerificationError("identity_mismatch");
  };

  if (!sameAccount(session, requested)) throw await rejectMismatch("login");

  let profile: PlayerProfile;
  try {
    profile = await provider.getPlayerProfile(session.token);
  } catch (error) {
    const mapped = toVerificationError(error);
    // The code is spent once login succeeds, so the player must request a new one.
    await store.failAttempt(input.attemptId, `profile:${mapped.code}`, true);
    throw mapped;
  }

  if (!sameAccount(profile, requested)) throw await rejectMismatch("profile");

  const checkedAt = now();
  const result = await store.finalizeVerification({
    attemptId: input.attemptId,
    profileId: input.profileId,
    profile,
    encryptedToken: deps.encrypt(session.token),
    dataSource: provider.dataSource,
    evidence: {
      provider: provider.name,
      data_source: provider.dataSource,
      login_role_id: session.roleId,
      login_zone_id: session.zoneId,
      profile_role_id: profile.roleId,
      profile_zone_id: profile.zoneId,
      checked_at: checkedAt.toISOString(),
    },
    nextSyncAt: new Date(checkedAt.getTime() + deps.syncIntervalHours * 3_600_000),
  });

  return { accountId: result.accountId, profile, transferred: result.transferredFrom !== null };
}
