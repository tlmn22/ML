import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PILOT_HEROES, PILOT_ITEM_IDS } from "@/content/catalog";
import { heroTranslationsMn } from "@/content/translations/mn/heroes";
import { itemTranslationsMn } from "@/content/translations/mn/items";
import { localizeGameText, type GameText } from "@/lib/i18n/game-text";
import { getMlbbProvider } from "@/lib/mlbb";
import type { HeroDetail, HeroSkill, ItemDetail } from "@/lib/mlbb/types";

export const CATALOG_TAG = "catalog";

export interface LocalizedHero extends Omit<HeroDetail, "skills"> {
  storyText: GameText | null;
  skills: (HeroSkill & { text: GameText })[];
}

export interface LocalizedItem extends ItemDetail {
  passiveText: GameText | null;
}

// Provider reads are cached for hours; a failure is cached for seconds only, so pages recover quickly.
async function fetchHero(id: number): Promise<HeroDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  try {
    return await getMlbbProvider().getHeroDetail(id);
  } catch (error) {
    cacheLife("seconds");
    console.error(`hero ${id} fetch failed`, error instanceof Error ? error.message : error);
    return null;
  }
}

async function fetchItems(): Promise<ItemDetail[] | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  try {
    return await getMlbbProvider().listItems();
  } catch (error) {
    cacheLife("seconds");
    console.error("items fetch failed", error instanceof Error ? error.message : error);
    return null;
  }
}

function localizeHero(hero: HeroDetail): LocalizedHero {
  const tr = heroTranslationsMn[hero.id];
  return {
    ...hero,
    storyText: hero.story ? localizeGameText(hero.story, tr?.story, tr?.review) : null,
    skills: hero.skills.map((skill) => ({
      ...skill,
      text: localizeGameText(skill.description, tr?.skills[skill.id], tr?.review),
    })),
  };
}

export async function getPilotHeroes(): Promise<LocalizedHero[] | null> {
  const heroes = await Promise.all(PILOT_HEROES.map((h) => fetchHero(h.id)));
  const ok = heroes.filter((h): h is HeroDetail => h !== null);
  return ok.length ? ok.map(localizeHero) : null;
}

/** undefined = not in the pilot set (404); null = provider unavailable. */
export async function getHeroBySlug(slug: string): Promise<LocalizedHero | null | undefined> {
  const entry = PILOT_HEROES.find((h) => h.slug === slug);
  if (!entry) return undefined;
  const hero = await fetchHero(entry.id);
  return hero ? localizeHero(hero) : null;
}

export async function getPilotItems(): Promise<LocalizedItem[] | null> {
  const items = await fetchItems();
  if (!items) return null;
  return PILOT_ITEM_IDS.flatMap((id) => {
    const item = items.find((i) => i.id === id);
    if (!item) return [];
    const tr = itemTranslationsMn[id];
    return [{ ...item, passiveText: item.passive ? localizeGameText(item.passive, tr?.passive, tr?.review) : null }];
  });
}

/** "CD: 11   Mana Cost: 60" → [{ label: "CD", value: "11s" }, { label: "Mana", value: "60" }] */
export function parseCdCost(raw: string | null): { label: string; value: string }[] {
  if (!raw) return [];
  const parts: { label: string; value: string }[] = [];
  const cd = raw.match(/CD:\s*([\d.]+)/i);
  if (cd) parts.push({ label: "CD", value: `${cd[1]}s` });
  for (const m of raw.matchAll(/(Mana|Energy|HP)\s*Cost:\s*([\d.%]+)/gi)) parts.push({ label: m[1], value: m[2] });
  return parts;
}
