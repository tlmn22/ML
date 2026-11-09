import { mn, type Dictionary } from "./dictionaries/mn";

export type Locale = "mn";
export const DEFAULT_LOCALE: Locale = "mn";

// Add a locale by creating dictionaries/<locale>.ts typed as `Dictionary` and registering it here.
const dictionaries: Record<Locale, Dictionary> = { mn };

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function formatRelativeTime(date: Date | string | null, now: Date, t: Dictionary): string {
  if (!date) return t.common.never;
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t.time.justNow;
  if (minutes < 60) return t.time.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.time.hoursAgo(hours);
  return t.time.daysAgo(Math.floor(hours / 24));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export type { Dictionary };
