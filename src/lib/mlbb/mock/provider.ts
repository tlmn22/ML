import { ProviderError, type MlbbProvider } from "../provider";
import type {
  GameAccountId,
  HeroDetail,
  HeroStatistic,
  HeroSummary,
  ItemDetail,
  PlayerProfile,
  ProviderSession,
} from "../types";

/**
 * Deterministic development provider. Every value it returns is DEMO DATA:
 * snapshots are tagged `source = 'mock'`, the leaderboard excludes them, and
 * `getMlbbProvider()` refuses to construct this in production.
 */
export const MOCK_VERIFICATION_CODE = "0000";

const TOKEN_PREFIX = "mock-session:";

function hash(n: number): number {
  let x = n ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}

export class MockMlbbProvider implements MlbbProvider {
  readonly name = "mock";
  readonly dataSource = "mock" as const;

  /** Bumped by tests to simulate a player climbing between syncs. */
  rankDrift = 0;

  async requestVerificationCode(account: GameAccountId): Promise<void> {
    if (account.roleId === 404) throw new ProviderError("invalid_input", "mock: unknown account");
  }

  async completeVerification(account: GameAccountId, code: string): Promise<ProviderSession> {
    if (code !== MOCK_VERIFICATION_CODE) throw new ProviderError("invalid_code", "mock: wrong code");
    return { token: `${TOKEN_PREFIX}${account.roleId}:${account.zoneId}`, roleId: account.roleId, zoneId: account.zoneId };
  }

  async getPlayerProfile(token: string): Promise<PlayerProfile> {
    if (!token.startsWith(TOKEN_PREFIX)) throw new ProviderError("unauthorized", "mock: invalid token");
    const [roleId, zoneId] = token.slice(TOKEN_PREFIX.length).split(":").map(Number);
    const seed = hash(roleId);
    const rankLevel = 60 + (seed % 180) + this.rankDrift;
    return {
      roleId,
      zoneId,
      nickname: `Demo${String(roleId).slice(-4)}`,
      avatarUrl: null,
      level: 30 + (seed % 70),
      rankLevel,
      highestRankLevel: rankLevel + (seed % 20),
      regCountry: "MN",
    };
  }

  async endSession(): Promise<void> {}

  async listHeroes(): Promise<HeroSummary[]> {
    return [1, 2, 3].map((id) => ({
      id,
      name: `Demo Hero ${id}`,
      slug: `demo-hero-${id}`,
      headImageUrl: null,
      relations: { strong: [], weak: [], assist: [] },
    }));
  }

  async getHeroDetail(heroId: number): Promise<HeroDetail> {
    return {
      id: heroId,
      name: `Demo Hero ${heroId}`,
      slug: `demo-hero-${heroId}`,
      roles: ["Fighter"],
      lanes: ["EXP Lane"],
      specialities: ["Demo"],
      story: "Demo hero for local development.",
      headImageUrl: null,
      portraitUrl: null,
      skills: [
        { id: heroId * 100 + 40, name: "Demo Passive", cdCost: null, tags: ["Buff"], description: "Demo passive.", iconUrl: null, isPassive: true },
        { id: heroId * 100 + 10, name: "Demo Skill", cdCost: "CD: 5   Mana Cost: 50", tags: ["AOE"], description: "Deals 100 damage.", iconUrl: null, isPassive: false },
      ],
    };
  }

  async listItems(): Promise<ItemDetail[]> {
    return [1, 2, 3].map((id) => ({
      id,
      name: `Demo Item ${id}`,
      category: "attack" as const,
      iconUrl: null,
      stats: ["+10 Extra Physical Attack"],
      passive: "Demo passive.",
    }));
  }

  async getHeroStatistics(): Promise<HeroStatistic[]> {
    return [1, 2, 3].map((heroId) => ({ heroId, winRate: 0.5, pickRate: 0.01, banRate: 0.01 }));
  }
}
