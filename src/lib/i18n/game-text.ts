import { createHash } from "node:crypto";
import type { ReviewStatus, TranslatedField } from "@/content/translations/types";

/** Stable fingerprint of a provider text, used to detect patch changes. */
export function sourceHash(source: string): string {
  return createHash("sha256").update(source.trim()).digest("hex").slice(0, 16);
}

export type GameTextState =
  /** Mongolian translation matching the current English text. */
  | "translated"
  /** A translation exists but the English text changed since (patch). */
  | "outdated"
  /** No translation yet. */
  | "missing";

export interface GameText {
  /** What to display: Mongolian when translated, otherwise the English original. */
  text: string;
  lang: "mn" | "en";
  state: GameTextState;
  review: ReviewStatus | null;
  original: string;
}

export function localizeGameText(
  source: string,
  translation: TranslatedField | undefined,
  review: ReviewStatus | undefined,
): GameText {
  if (!translation) return { text: source, lang: "en", state: "missing", review: null, original: source };
  if (translation.sourceHash !== sourceHash(source)) {
    return { text: source, lang: "en", state: "outdated", review: review ?? null, original: source };
  }
  return { text: translation.text, lang: "mn", state: "translated", review: review ?? null, original: source };
}
