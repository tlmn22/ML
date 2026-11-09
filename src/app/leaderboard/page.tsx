import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDateTime, getDictionary } from "@/lib/i18n";
import { RANK_TIERS, decodeRankLevel, isRankTier } from "@/lib/mlbb/ranks";
import { getLeaderboard } from "@/lib/services/leaderboard";
import { RankEmblem, WeeklyChange } from "@/components/rank";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, PageHeader, Skeleton, cn, inputClass } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = {
  title: t.leaderboard.title,
  description: t.leaderboard.subtitle,
};

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <>
      <PageHeader
        title={t.leaderboard.title}
        subtitle={t.leaderboard.subtitle}
        actions={<ButtonLink href="/settings" variant="secondary" size="sm">{t.leaderboard.join}</ButtonLink>}
      />
      <Suspense fallback={<LeaderboardSkeleton />}>
        <Leaderboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Leaderboard({ searchParams }: { searchParams: PageProps<"/leaderboard">["searchParams"] }) {
  const params = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const tierParam = pick(params.tier);
  const tier = isRankTier(tierParam) ? tierParam : undefined;
  const search = pick(params.q).slice(0, 30);
  const limit = pick(params.top) === "10" ? 10 : 100;

  const result = await getLeaderboard({ limit, tier, search });
  // "Stale" = more than 3 days behind the freshest entry on the board.
  const staleCutoff = result.ok && result.lastUpdated ? new Date(result.lastUpdated).getTime() - 3 * 24 * 3_600_000 : 0;
  const href = (top: number) => {
    const qs = new URLSearchParams({ top: String(top), ...(tier ? { tier } : {}), ...(search ? { q: search } : {}) });
    return `/leaderboard?${qs}`;
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="top" value={limit} />
        <input name="q" defaultValue={search} placeholder={t.leaderboard.search} aria-label={t.leaderboard.search} maxLength={30} className={cn(inputClass, "min-w-0 flex-1 basis-48")} />
        <select name="tier" defaultValue={tier ?? ""} aria-label={t.leaderboard.allTiers} className={cn(inputClass, "w-auto basis-40")}>
          <option value="">{t.leaderboard.allTiers}</option>
          {RANK_TIERS.map((r) => (
            <option key={r.tier} value={r.tier}>{r.name}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary">{t.leaderboard.search}</Button>
      </form>

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {[10, 100].map((n) => (
            <Link
              key={n}
              href={href(n)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", limit === n ? "bg-surface-2 text-gold" : "text-muted hover:text-text")}
            >
              {n === 10 ? t.leaderboard.top10 : t.leaderboard.top100}
            </Link>
          ))}
        </div>
        {result.ok && result.lastUpdated ? (
          <p className="text-xs text-faint">{t.leaderboard.lastUpdated}: {formatDateTime(result.lastUpdated)}</p>
        ) : null}
      </div>

      {!result.ok ? (
        <Alert tone="danger">{t.common.unknownError}</Alert>
      ) : result.entries.length === 0 ? (
        <EmptyState title={search || tier ? t.leaderboard.emptyFiltered : t.leaderboard.empty} />
      ) : (
        <Card className="p-0">
          <ol className="divide-y divide-border">
            {result.entries.map((e) => {
              const rank = decodeRankLevel(e.rankLevel);
              const stale = !e.lastSyncedAt || new Date(e.lastSyncedAt).getTime() < staleCutoff;
              return (
                <li key={e.username}>
                  <Link href={`/players/${e.username}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                    <span className={cn("w-8 text-center font-display text-lg font-bold", e.position <= 3 ? "text-gold" : "text-muted")}>
                      {e.position}
                    </span>
                    <RankEmblem level={e.rankLevel} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{e.nickname ?? e.displayName ?? e.username}</span>
                      <span className="block truncate text-xs text-muted">
                        {rank?.label ?? "—"} · @{e.username}
                      </span>
                    </span>
                    {stale ? <Badge tone="warning" className="hidden sm:inline-flex">{t.leaderboard.stale}</Badge> : null}
                    <span className="w-14 text-right text-sm" title={t.leaderboard.weekly}>
                      <WeeklyChange value={e.weeklyChange} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-11" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
