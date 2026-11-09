/**
 * Decoding of MLBB `rank_level` values into tier / division / stars.
 *
 * Band boundaries come from Rone Arena `GET /api/academy/ranks` (captured 2026-11-05).
 * ASSUMPTION (docs/API_FEASIBILITY.md U4/U5): a player's `rank_level` from
 * `/api/user/info` uses this same cumulative scale, and stars = level − band start.
 * Raw levels are stored in the database, so fixing this table re-interprets all history.
 */

export type RankTier =
  | "warrior"
  | "elite"
  | "master"
  | "grandmaster"
  | "epic"
  | "legend"
  | "mythic"
  | "mythical_honor"
  | "mythical_glory"
  | "mythical_immortal";

interface TierDefinition {
  tier: RankTier;
  name: string;
  icon: string;
  /** Division bands, highest division number first (e.g. V → I). Empty for Mythic tiers. */
  divisions: { division: number; start: number; end: number }[];
  start: number;
  end: number;
}

const ICON_BASE = "https://akmweb.youngjoygame.com/web/gms/image/";

/** Mythic stars are counted from this level (Mythic 0★). */
export const MYTHIC_START = 136;

const divisions = (start: number, sizes: number[]) => {
  let cursor = start;
  return sizes.map((size, i) => {
    const band = { division: sizes.length - i, start: cursor, end: cursor + size - 1 };
    cursor += size;
    return band;
  });
};

export const RANK_TIERS: readonly TierDefinition[] = [
  { tier: "warrior", name: "Warrior", icon: `${ICON_BASE}e8659ed5040a378701beca13ebdc4fba.png`, divisions: divisions(1, [4, 3, 3]), start: 1, end: 10 },
  { tier: "elite", name: "Elite", icon: `${ICON_BASE}a59c039465d5f17165243026c42b9d2c.png`, divisions: divisions(11, [5, 5, 5]), start: 11, end: 25 },
  { tier: "master", name: "Master", icon: `${ICON_BASE}ca966487da98a5e2732f4c56a05f33d2.png`, divisions: divisions(26, [5, 5, 5, 5]), start: 26, end: 45 },
  { tier: "grandmaster", name: "Grandmaster", icon: `${ICON_BASE}d5e6df23d867833a204b82e44836bd8a.png`, divisions: divisions(46, [6, 6, 6, 6, 6]), start: 46, end: 75 },
  { tier: "epic", name: "Epic", icon: `${ICON_BASE}c9aaf42eb6c6f759d13b1d4da35335b7.png`, divisions: divisions(76, [6, 6, 6, 6, 6]), start: 76, end: 105 },
  { tier: "legend", name: "Legend", icon: `${ICON_BASE}c1aa051fd25d3b88b7b2b9ac145b2b52.png`, divisions: divisions(106, [6, 6, 6, 6, 6]), start: 106, end: 135 },
  { tier: "mythic", name: "Mythic", icon: `${ICON_BASE}641379610654942449fa3d5cf633d38c.png`, divisions: [], start: 136, end: 160 },
  { tier: "mythical_honor", name: "Mythical Honor", icon: `${ICON_BASE}078ee96145da945b0cbbb8e2a48ca7c9.png`, divisions: [], start: 161, end: 185 },
  { tier: "mythical_glory", name: "Mythical Glory", icon: `${ICON_BASE}acc8347c7284e6d9caa09d3b3f8e0948.png`, divisions: [], start: 186, end: 235 },
  { tier: "mythical_immortal", name: "Mythical Immortal", icon: `${ICON_BASE}191257b84f57be74430d1964c4b01c8b.png`, divisions: [], start: 236, end: 9999 },
];

export interface DecodedRank {
  level: number;
  tier: RankTier;
  tierName: string;
  /** Roman-numeral division (1–5) below Mythic; null for Mythic tiers. */
  division: number | null;
  stars: number;
  /** Stars needed to leave the division; null for Mythic tiers. */
  maxStars: number | null;
  icon: string;
  /** e.g. "Legend III ★4" or "Mythical Glory ★63". */
  label: string;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];

export function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

export function decodeRankLevel(level: number | null | undefined): DecodedRank | null {
  if (level == null || !Number.isInteger(level) || level < 1) return null;
  const def = RANK_TIERS.find((t) => level >= t.start && level <= t.end);
  if (!def) return null;

  if (def.divisions.length === 0) {
    const stars = level - MYTHIC_START;
    return {
      level,
      tier: def.tier,
      tierName: def.name,
      division: null,
      stars,
      maxStars: null,
      icon: def.icon,
      label: `${def.name} ★${stars}`,
    };
  }

  const band = def.divisions.find((d) => level >= d.start && level <= d.end)!;
  const stars = level - band.start;
  return {
    level,
    tier: def.tier,
    tierName: def.name,
    division: band.division,
    stars,
    maxStars: band.end - band.start,
    icon: def.icon,
    label: `${def.name} ${toRoman(band.division)} ★${stars}`,
  };
}

/** Inclusive `rank_level` range for a tier, for leaderboard filtering. */
export function tierRange(tier: RankTier): { min: number; max: number } {
  const def = RANK_TIERS.find((t) => t.tier === tier);
  if (!def) throw new Error(`Unknown tier: ${tier}`);
  return { min: def.start, max: def.end };
}

export function isRankTier(value: string): value is RankTier {
  return RANK_TIERS.some((t) => t.tier === value);
}
