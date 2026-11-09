/**
 * Pilot set: the heroes and items shown on /heroes and /items while translations
 * are being tested. One hero per role. Add entries here as translations are added;
 * `npm run translations:status` reports what still needs translating.
 */
export const PILOT_HEROES = [
  { id: 1, slug: "miya" }, // Marksman
  { id: 6, slug: "tigreal" }, // Tank
  { id: 7, slug: "alucard" }, // Fighter
  { id: 15, slug: "eudora" }, // Mage
  { id: 17, slug: "fanny" }, // Assassin
] as const;

export const PILOT_HERO_IDS = PILOT_HEROES.map((h) => h.id);

export const PILOT_ITEM_IDS = [
  3008, // Blade of Despair — Attack
  3005, // Windtalker — Attack
  3102, // Holy Crystal — Magic
  3205, // Athena's Shield — Defense
  3207, // Immortality — Defense
] as const;
