import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, formatRelativeTime, getDictionary } from "@/lib/i18n";
import { getAccountByProfile, getSnapshots } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";
import { RankChart, RankSummary } from "@/components/rank";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { VerificationBadge } from "@/components/dashboard/verification-badge";
import { Alert, ButtonLink, Card, CardTitle, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.dashboard.title, robots: { index: false } };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title={t.dashboard.title} />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const profile = await requireProfile("/dashboard");
  const supabase = await createClient();
  const account = await getAccountByProfile(supabase, profile.id);

  if (!account) {
    return (
      <EmptyState
        title={t.dashboard.noAccountTitle}
        body={t.dashboard.noAccountBody}
        action={<ButtonLink href="/dashboard/link-account">{t.dashboard.linkCta}</ButtonLink>}
      />
    );
  }

  const snapshots = await getSnapshots(supabase, account.id, 60);
  const now = new Date();

  return (
    <div className="space-y-5">
      {account.status === "reauth_required" ? (
        <Alert tone="warning" title={t.dashboard.reauthTitle}>
          <p>{t.dashboard.reauthBody}</p>
          <ButtonLink href="/dashboard/link-account" size="sm" className="mt-3">
            {t.dashboard.reconnect}
          </ButtonLink>
        </Alert>
      ) : null}

      {!profile.leaderboardOptIn ? (
        <Alert>
          {t.dashboard.leaderboardHint}{" "}
          <Link href="/settings" className="font-semibold text-electric hover:underline">
            {t.dashboard.leaderboardHintCta}
          </Link>
        </Alert>
      ) : null}

      <Card className="animate-fade-up shadow-glow-gold">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-display text-xl font-bold">{account.nickname ?? "—"}</span>
              <VerificationBadge account={account} />
            </div>
            <CardTitle className="mb-2">{t.dashboard.currentRank}</CardTitle>
            <RankSummary level={account.currentRankLevel} size="lg" />
            {account.currentRankLevel === null ? <p className="mt-2 text-sm text-muted">{t.dashboard.unrankedNote}</p> : null}
          </div>
          {account.verificationMethod === "provider_code" && account.status === "active" ? <RefreshButton /> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t.dashboard.highestRank}>
          <RankSummary level={account.highestRankLevel} />
        </Stat>
        <Stat label={t.dashboard.playerId}>
          <span className="font-mono text-lg">{account.roleId}</span>
        </Stat>
        <Stat label={t.dashboard.serverId}>
          <span className="font-mono text-lg">{account.zoneId}</span>
        </Stat>
        <Stat label={t.dashboard.lastSync}>
          <span title={account.lastSyncedAt ? formatDateTime(account.lastSyncedAt) : undefined}>
            {formatRelativeTime(account.lastSyncedAt, now, t)}
          </span>
        </Stat>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>{t.dashboard.progressTitle}</CardTitle>
          <Link href="/dashboard/rank-history" className="text-sm font-semibold text-electric hover:underline">
            {t.dashboard.historyLink} →
          </Link>
        </div>
        {snapshots.length >= 2 ? <RankChart points={snapshots} /> : <p className="text-sm text-muted">{t.dashboard.noHistory}</p>}
      </Card>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
      <div className="text-sm">{children}</div>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-44" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
