import { describe, expect, it } from "vitest";
import fixture from "../fixtures/rone-arena/ranks.json";
import { RANK_TIERS, decodeRankLevel, tierRange } from "@/lib/mlbb/ranks";

describe("rank table", () => {
  it("matches every band published by /api/academy/ranks", () => {
    const ours = RANK_TIERS.flatMap((t) =>
      t.divisions.length
        ? t.divisions.map((d) => ({ start: d.start, end: d.end, icon: t.icon }))
        : [{ start: t.start, end: t.end, icon: t.icon }],
    ).sort((a, b) => a.start - b.start);
    const theirs = fixture.bands
      .map((b) => ({ start: b.rankid_start, end: b.rankid_end, icon: b.icon }))
      .sort((a, b) => a.start - b.start);
    expect(ours).toEqual(theirs);
  });

  it("covers 1..9999 without gaps", () => {
    for (let level = 1; level <= 400; level++) expect(decodeRankLevel(level)).not.toBeNull();
    expect(decodeRankLevel(9999)?.tier).toBe("mythical_immortal");
  });
});

describe("decodeRankLevel", () => {
  it.each([
    [1, "Warrior III ★0"],
    [10, "Warrior I ★2"],
    [11, "Elite III ★0"],
    [26, "Master IV ★0"],
    [75, "Grandmaster I ★5"],
    [120, "Legend III ★2"],
    [135, "Legend I ★5"],
    [136, "Mythic ★0"],
    [161, "Mythical Honor ★25"],
    [186, "Mythical Glory ★50"],
    [236, "Mythical Immortal ★100"],
  ])("decodes %i as %s", (level, label) => {
    expect(decodeRankLevel(level)?.label).toBe(label);
  });

  it("returns null for unranked or invalid values", () => {
    for (const v of [0, -1, 1.5, null, undefined, Number.NaN]) expect(decodeRankLevel(v)).toBeNull();
  });

  it("gives tier ranges for filtering", () => {
    expect(tierRange("legend")).toEqual({ min: 106, max: 135 });
    expect(tierRange("mythical_glory")).toEqual({ min: 186, max: 235 });
  });
});
