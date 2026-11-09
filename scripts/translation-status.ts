/**
 * Compare live provider text with our Mongolian translations.
 *
 *   npm run translations:status            summary per hero/item
 *   npm run translations:status -- --show  also print source text + hash for every field
 *
 * Exits with code 1 when anything is outdated (English changed in a patch) or missing,
 * so it can run in CI or a scheduled job.
 */
import { PILOT_HERO_IDS, PILOT_ITEM_IDS } from "../src/content/catalog";
import { heroTranslationsMn } from "../src/content/translations/mn/heroes";
import { itemTranslationsMn } from "../src/content/translations/mn/items";
import { localizeGameText, sourceHash, type GameText } from "../src/lib/i18n/game-text";
import { RoneArenaClient } from "../src/lib/mlbb/rone-arena/client";
import { RoneArenaProvider } from "../src/lib/mlbb/rone-arena/provider";

const show = process.argv.includes("--show");
const provider = new RoneArenaProvider(
  new RoneArenaClient({
    baseUrl: process.env.RONE_ARENA_BASE_URL ?? "https://arena.rone.dev",
    allowedHosts: ["arena.rone.dev", "arena.fastapicloud.dev"],
  }),
);

const counts = { translated: 0, outdated: 0, missing: 0 };
const mark = { translated: "✓", outdated: "⚠ OUTDATED", missing: "✗ missing" };

function report(label: string, source: string, result: GameText) {
  counts[result.state]++;
  if (result.state !== "translated" || show) console.log(`   ${mark[result.state].padEnd(10)} ${label}`);
  if (show) console.log(`      hash: ${sourceHash(source)}\n      en:   ${source.replace(/\n/g, "⏎")}`);
}

async function main() {
  for (const id of PILOT_HERO_IDS) {
    const hero = await provider.getHeroDetail(id);
    const tr = heroTranslationsMn[id];
    console.log(`\n■ Hero ${id} ${hero.name}`);
    if (hero.story) report("story", hero.story, localizeGameText(hero.story, tr?.story, tr?.review));
    for (const skill of hero.skills) {
      report(`${skill.id} ${skill.name}`, skill.description, localizeGameText(skill.description, tr?.skills[skill.id], tr?.review));
    }
  }

  const items = await provider.listItems();
  for (const id of PILOT_ITEM_IDS) {
    const item = items.find((i) => i.id === id);
    console.log(`\n■ Item ${id} ${item?.name ?? "(not found)"}`);
    if (item?.passive) {
      const tr = itemTranslationsMn[id];
      report("passive", item.passive, localizeGameText(item.passive, tr?.passive, tr?.review));
    }
  }

  console.log(`\nTranslated ${counts.translated} · outdated ${counts.outdated} · missing ${counts.missing}`);
  if (counts.outdated || counts.missing) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
