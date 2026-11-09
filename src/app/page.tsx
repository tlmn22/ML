import Link from "next/link";
import { Suspense } from "react";
import { getDictionary } from "@/lib/i18n";
import { getLeaderboard } from "@/lib/services/leaderboard";
import { RankEmblem } from "@/components/rank";
import { ButtonLink, Card, CardTitle, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

async function TopPlayers() {
  const result = await getLeaderboard({ limit: 10 });
  if (!result.ok || result.entries.length === 0) {
    return <p className="text-sm text-muted">{t.leaderboard.empty}</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {result.entries.slice(0, 5).map((e) => (
        <li key={e.username}>
          <Link href={`/players/${e.username}`} className="flex items-center gap-3 py-2.5 hover:text-gold">
            <span className="w-6 text-center font-display font-bold text-muted">{e.position}</span>
            <RankEmblem level={e.rankLevel} size={32} />
            <span className="min-w-0 flex-1 truncate font-medium">{e.nickname ?? e.displayName ?? e.username}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default function HomePage() {
  const steps = [
    [t.home.step1Title, t.home.step1Body],
    [t.home.step2Title, t.home.step2Body],
    [t.home.step3Title, t.home.step3Body],
  ];
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="animate-fade-up">
          <p className="mb-3 inline-flex rounded-full border border-violet/40 bg-violet/10 px-3 py-1 text-xs font-semibold text-violet">
            {t.meta.tagline}
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            <span className="text-gradient-gold">{t.home.heroTitle}</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{t.home.heroBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard/link-account" size="lg">{t.home.ctaStart}</ButtonLink>
            <ButtonLink href="/leaderboard" size="lg" variant="secondary">{t.home.ctaLeaderboard}</ButtonLink>
          </div>
        </div>
        <Card className="shadow-glow-electric">
          <CardTitle className="mb-3">{t.leaderboard.top10}</CardTitle>
          <Suspense fallback={<div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div>}>
            <TopPlayers />
          </Suspense>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl font-bold">{t.home.stepsTitle}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={title}>
              <Card className="h-full">
                <span className="font-display text-3xl font-extrabold text-electric">0{i + 1}</span>
                <p className="mt-2 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Card className="border-gold/30">
        <p className="font-semibold text-gold">{t.home.trustTitle}</p>
        <p className="mt-1 text-sm text-muted">{t.home.trustBody}</p>
      </Card>
    </div>
  );
}
