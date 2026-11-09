import type { Metadata } from "next";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, getDictionary } from "@/lib/i18n";
import { decodeRankLevel } from "@/lib/mlbb/ranks";
import { getAccountByProfile, getSnapshots } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";
import { RankChart, RankEmblem, WeeklyChange } from "@/components/rank";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.history.title, robots: { index: false } };

export default function RankHistoryPage() {
  return (
    <>
      <PageHeader title={t.history.title} subtitle={t.history.note} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <History />
      </Suspense>
    </>
  );
}

async function History() {
  const profile = await requireProfile("/dashboard/rank-history");
  const supabase = await createClient();
  const account = await getAccountByProfile(supabase, profile.id);
  if (!account) {
    return (
      <EmptyState
        title={t.dashboard.noAccountTitle}
        action={<ButtonLink href="/dashboard/link-account">{t.dashboard.linkCta}</ButtonLink>}
      />
    );
  }

  const snapshots = await getSnapshots(supabase, account.id, 365);
  if (snapshots.length === 0) return <EmptyState title={t.history.empty} />;

  const rows = snapshots.map((s, i) => ({ ...s, change: i > 0 ? s.rankLevel - snapshots[i - 1].rankLevel : null })).reverse();
  const sourceTone = { provider: "success", admin_manual: "violet", mock: "warning" } as const;

  return (
    <div className="space-y-5">
      {snapshots.length >= 2 ? (
        <Card>
          <RankChart points={snapshots} height={260} />
        </Card>
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-3 font-medium">{t.history.date}</th>
              <th className="px-4 py-3 font-medium">{t.history.rank}</th>
              <th className="px-4 py-3 font-medium">{t.history.change}</th>
              <th className="px-4 py-3 font-medium">{t.history.source}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.capturedAt}>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(row.capturedAt)}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <RankEmblem level={row.rankLevel} size={24} />
                    {decodeRankLevel(row.rankLevel)?.label ?? row.rankLevel}
                  </span>
                </td>
                <td className="px-4 py-3"><WeeklyChange value={row.change} /></td>
                <td className="px-4 py-3">
                  <Badge tone={sourceTone[row.source]}>{t.history.sources[row.source]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
