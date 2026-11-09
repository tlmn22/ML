import type {
  DataSource,
  GameAccountId,
  HeroDetail,
  HeroStatistic,
  HeroSummary,
  ItemDetail,
  PlayerProfile,
  ProviderSession,
} from "./types";

export type ProviderErrorKind =
  /** Request rejected as malformed (e.g. IDs out of range). */
  | "invalid_input"
  /** Verification code wrong or expired. */
  | "invalid_code"
  /** Session token invalid or expired: the player must verify again. */
  | "unauthorized"
  | "rate_limited"
  /** 5xx, timeout, network failure, or maintenance. */
  | "unavailable"
  /** Response did not match the expected schema. */
  | "invalid_response"
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(kind: ProviderErrorKind, message: string, options?: { status?: number; retryAfterMs?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.kind = kind;
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export interface MlbbProvider {
  readonly name: string;
  /** Tag written on every snapshot this provider produces. */
  readonly dataSource: DataSource;

  /** Ask the game to mail a verification code to the account. Never retried automatically. */
  requestVerificationCode(account: GameAccountId): Promise<void>;
  /** Exchange the code for a session. Throws `invalid_code` on a wrong/expired code. */
  completeVerification(account: GameAccountId, code: string): Promise<ProviderSession>;
  /** Profile of the account that owns `token`. Throws `unauthorized` when the token is no longer valid. */
  getPlayerProfile(token: string): Promise<PlayerProfile>;
  /** Invalidate the session upstream. Best effort. */
  endSession(token: string): Promise<void>;

  listHeroes(): Promise<HeroSummary[]>;
  getHeroDetail(heroId: number): Promise<HeroDetail>;
  listItems(): Promise<ItemDetail[]>;
  getHeroStatistics(options: { days: 1 | 3 | 7 | 15 | 30; rank: string }): Promise<HeroStatistic[]>;
}
