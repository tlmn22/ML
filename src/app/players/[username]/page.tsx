import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDateTime, getDictionary } from "@/lib/i18n";
import { decodeRankLevel } from "@/lib/mlbb/ranks";
import { getPublicPlayer } from "@/lib/services/players";
import { RankChart, RankSummary } from "@/components/rank";
import { ShareButton } from "@/components/share-button";
import { VerificationBadge } from "@/components/dashboard/verification-badge";
import { Alert, Card, CardTitle, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export async function generateMetadata({ params }: PageProps<"/players/[username]">): Promise<Metadata> {
  const { username } = await params;
  const player = await getPublicPlayer(username.toLowerCase());
  if (!player) return { title: t.player.notFound, robots: { index: false } };
  const name = player.account?.nickname ?? player.displayName ?? player.username;
  const rank = decodeRankLevel(player.account?.currentRankLevel)?.label;
  return {
    title: name,
    description: rank ? `${name} — ${rank}` : `${name} · ${t.meta.siteName}`,
    robots: player.account ? undefined : { index: false },
  };
}

export default function PlayerPage({ params }: PageProps<"/players/[username]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: { params: PageProps<"/players/[username]">["params"] }) {
  const { username } = await params;
  const player = await getPublicPlayer(username.toLowerCase());
  if (!player) notFound();
  const { account } = player;
  const name = account?.nickname ?? player.displayName ?? player.username;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{name}</h1>
          <p className="text-sm text-muted">
            @{player.username} · {t.player.memberSince} {formatDateTime(player.memberSince).split(" ")[0]}
          </p>
        </div>
        <ShareButton title={name} path={`/players/${player.username}`} />
      </div>

      {!account ? (
        <Alert>{t.player.private}</Alert>
      ) : (
        <>
          <Card className="shadow-glow-gold">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CardTitle>{t.dashboard.currentRank}</CardTitle>
              <VerificationBadge account={account} />
            </div>
            <RankSummary level={account.currentRankLevel} size="lg" />
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wider text-faint">{t.dashboard.highestRank}</dt>
                <dd className="mt-1">{decodeRankLevel(account.highestRankLevel)?.label ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-faint">{t.dashboard.playerId}</dt>
                <dd className="mt-1 font-mono">{account.roleId}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-faint">{t.dashboard.serverId}</dt>
                <dd className="mt-1 font-mono">{account.zoneId}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-faint">{t.dashboard.lastSync}</dt>
                <dd className="mt-1">{account.lastSyncedAt ? formatDateTime(account.lastSyncedAt) : t.common.never}</dd>
              </div>
            </dl>
          </Card>
          {player.snapshots.length >= 2 ? (
            <Card>
              <CardTitle className="mb-3">{t.dashboard.progressTitle}</CardTitle>
              <RankChart points={player.snapshots} />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
