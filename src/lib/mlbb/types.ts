/** Provider-agnostic MLBB domain models. Business logic depends only on these. */

export interface GameAccountId {
  roleId: number;
  zoneId: number;
}

export interface PlayerProfile extends GameAccountId {
  nickname: string | null;
  avatarUrl: string | null;
  level: number | null;
  /** Raw cumulative rank value; decode with `decodeRankLevel`. */
  rankLevel: number | null;
  highestRankLevel: number | null;
  regCountry: string | null;
}

/** An authenticated provider session. `token` is a credential: never log or send it to a browser. */
export interface ProviderSession {
  token: string;
  roleId: number;
  zoneId: number;
}

export interface HeroSummary {
  id: number;
  name: string;
  slug: string;
  headImageUrl: string | null;
  relations: { strong: number[]; weak: number[]; assist: number[] };
}

export interface HeroStatistic {
  heroId: number;
  winRate: number | null;
  pickRate: number | null;
  banRate: number | null;
}

/** Where a piece of player data came from. Mirrors the `source` check constraints in SQL. */
export type DataSource = "provider" | "admin_manual" | "mock";

export interface HeroSkill {
  id: number;
  name: string;
  /** Raw "CD: 11   Mana Cost: 60" string; empty for passives. */
  cdCost: string | null;
  tags: string[];
  /** Provider rich text: may contain <font color="…">, <br>, and <1234> placeholders. */
  description: string;
  iconUrl: string | null;
  isPassive: boolean;
}

export interface HeroDetail {
  id: number;
  name: string;
  slug: string;
  roles: string[];
  lanes: string[];
  specialities: string[];
  story: string | null;
  headImageUrl: string | null;
  portraitUrl: string | null;
  skills: HeroSkill[];
}

export type ItemCategory = "attack" | "magic" | "defense" | "movement" | "jungle" | "roam";

export interface ItemDetail {
  id: number;
  name: string;
  category: ItemCategory | null;
  iconUrl: string | null;
  /** e.g. "+160 Extra Physical Attack" */
  stats: string[];
  /** Passive/unique effect rich text, null if the item has none. */
  passive: string | null;
}
