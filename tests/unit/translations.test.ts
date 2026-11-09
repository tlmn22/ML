import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PILOT_HERO_IDS, PILOT_ITEM_IDS } from "@/content/catalog";
import { heroTranslationsMn } from "@/content/translations/mn/heroes";
import { itemTranslationsMn } from "@/content/translations/mn/items";
import { localizeGameText, sourceHash } from "@/lib/i18n/game-text";
import { RoneArenaClient } from "@/lib/mlbb/rone-arena/client";
import { RoneArenaProvider, parseItemStats } from "@/lib/mlbb/rone-arena/provider";
import type { HeroDetail, ItemDetail } from "@/lib/mlbb/types";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "rone-arena");

/** Serves saved live responses, so these tests run the real client + normalization. */
const fixtureProvider = new RoneArenaProvider(
  new RoneArenaClient({
    baseUrl: "https://arena.rone.dev",
    allowedHosts: ["arena.rone.dev"],
    fetchImpl: (async (input: string | URL | Request) => {
      const { pathname } = new URL(String(input));
      const hero = pathname.match(/^\/api\/heroes\/(\d+)$/);
      const file = hero ? join("heroes", `${hero[1]}.json`) : pathname.endsWith("/equipment/expanded") ? "items.json" : null;
      if (!file) return new Response("{}", { status: 404 });
      return new Response(readFileSync(join(FIXTURES, file), "utf8"), { status: 200 });
    }) as typeof fetch,
  }),
);

/** Facts a translation must preserve: numbers, placeholders, and colored spans. */
function invariants(text: string) {
  const colors = [...text.matchAll(/<font color="([0-9a-fA-F]{6})">/g)].map((m) => m[1].toLowerCase()).sort();
  const placeholders = [...text.matchAll(/<(\d{3,5})>/g)].map((m) => m[1]).sort();
  const plain = text.replace(/<font color="[0-9a-fA-F]{6}">|<\/font>|<br\s*\/?>|<\d{3,5}>/g, " ");
  const numbers = (plain.match(/\d+(?:\.\d+)?/g) ?? []).sort();
  return { colors, placeholders, numbers };
}

let heroes: HeroDetail[];
let items: ItemDetail[];

beforeAll(async () => {
  heroes = await Promise.all(PILOT_HERO_IDS.map((id) => fixtureProvider.getHeroDetail(id)));
  items = await fixtureProvider.listItems();
});

describe("provider normalization", () => {
  it("parses hero detail: roles, lanes, passive first, cooldown text", () => {
    const miya = heroes.find((h) => h.id === 1)!;
    expect(miya).toMatchObject({ name: "Miya", slug: "miya", roles: ["Marksman"], lanes: ["Gold Lane"] });
    expect(miya.skills.map((s) => [s.id, s.isPassive])).toEqual([[140, true], [110, false], [120, false], [130, false]]);
    expect(miya.skills[1].cdCost).toBe("CD: 11   Mana Cost: 60");
    expect(miya.portraitUrl).toMatch(/^https:\/\/akmweb\.youngjoygame\.com\//);
  });

  it("parses items and fixes stat spacing", () => {
    const hunter = parseItemStats("+15Physical Penetration<br>+80 Extra Physical Attack<br>+10% Cooldown Reduction<br>");
    expect(hunter).toEqual(["+15 Physical Penetration", "+80 Extra Physical Attack", "+10% Cooldown Reduction"]);
    const bod = items.find((i) => i.id === 3008)!;
    expect(bod).toMatchObject({ name: "Blade of Despair", category: "attack", stats: ["+160 Extra Physical Attack", "+5% Movement Speed"] });
    expect(bod.passive).toMatch(/^Despair:/);
  });
});

describe("Mongolian translations", () => {
  it("cover every pilot hero skill and story, matching the fixture source", () => {
    for (const hero of heroes) {
      const tr = heroTranslationsMn[hero.id];
      expect(tr, `hero ${hero.name}`).toBeDefined();
      expect(tr.story?.sourceHash, `${hero.name} story`).toBe(sourceHash(hero.story!));
      for (const skill of hero.skills) {
        expect(tr.skills[skill.id]?.sourceHash, `${hero.name} ${skill.name}`).toBe(sourceHash(skill.description));
      }
    }
  });

  it("cover every pilot item passive", () => {
    for (const id of PILOT_ITEM_IDS) {
      const item = items.find((i) => i.id === id)!;
      expect(itemTranslationsMn[id]?.passive?.sourceHash, item.name).toBe(sourceHash(item.passive!));
    }
  });

  it("keep every number, placeholder, and colored span from the source", () => {
    const pairs: [string, string, string][] = [];
    for (const hero of heroes) {
      const tr = heroTranslationsMn[hero.id];
      for (const skill of hero.skills) pairs.push([`${hero.name} ${skill.name}`, skill.description, tr.skills[skill.id].text]);
    }
    for (const item of items) {
      const tr = itemTranslationsMn[item.id];
      if (tr?.passive && item.passive) pairs.push([item.name, item.passive, tr.passive.text]);
    }
    expect(pairs.length).toBe(25);
    for (const [label, source, mn] of pairs) {
      expect(invariants(mn), label).toEqual(invariants(source));
    }
  });
});

describe("patch detection", () => {
  const field = { sourceHash: sourceHash("Deals 100 damage."), text: "100 damage учруулна." };

  it("shows Mongolian while the English source is unchanged", () => {
    expect(localizeGameText("Deals 100 damage.", field, "ai_draft")).toMatchObject({ lang: "mn", state: "translated" });
  });

  it("falls back to English and flags it when a patch changes the source", () => {
    expect(localizeGameText("Deals 120 damage.", field, "ai_draft")).toMatchObject({
      lang: "en",
      state: "outdated",
      text: "Deals 120 damage.",
    });
  });

  it("reports missing translations", () => {
    expect(localizeGameText("New skill.", undefined, undefined)).toMatchObject({ lang: "en", state: "missing" });
  });
});

describe("pilot catalog", () => {
  it("lists slugs that match the provider's hero names", async () => {
    const { PILOT_HEROES } = await import("@/content/catalog");
    expect(heroes.map((h) => h.slug)).toEqual(PILOT_HEROES.map((h) => h.slug));
  });
});
