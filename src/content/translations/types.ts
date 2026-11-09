/**
 * Mongolian translations of provider game text (skills, items).
 *
 * Each translated field records `sourceHash`: the hash of the exact English text it was
 * translated from (see `sourceHash()`). When a patch changes the English text, the hash
 * stops matching and the UI shows the field as outdated with the English original,
 * instead of a translation that may contain old numbers.
 *
 * Markup: keep the provider's `<font color="…">…</font>`, `<br>` and `<1234>` tokens,
 * and keep every number from the source. `tests/unit/translations.test.ts` enforces both.
 */

export type ReviewStatus =
  /** Machine/AI draft, not yet checked by a human. Shown with a badge. */
  | "ai_draft"
  /** Checked by a Mongolian-speaking reviewer. */
  | "reviewed";

export interface TranslatedField {
  sourceHash: string;
  text: string;
}

export interface HeroTranslation {
  review: ReviewStatus;
  story?: TranslatedField;
  /** Keyed by provider skill id. */
  skills: Record<number, TranslatedField>;
}

export interface ItemTranslation {
  review: ReviewStatus;
  passive?: TranslatedField;
}
