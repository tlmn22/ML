import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PILOT_HEROES } from "@/content/catalog";
import { getDictionary } from "@/lib/i18n";
import { getHeroBySlug, parseCdCost } from "@/lib/services/catalog";
import { GameTextBlock, RichGameText } from "@/components/game-text";
import { Alert, Badge, Card, CardTitle, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export function generateStaticParams() {
  return PILOT_HEROES.map((h) => ({ slug: h.slug }));
}

export async function generateMetadata({ params }: PageProps<"/heroes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const hero = await getHeroBySlug(slug);
  if (!hero) return { title: t.heroes.title };
  return {
    title: `${hero.name} — skill-ийн монгол тайлбар`,
    description: `${hero.name} (${hero.roles.join("/")}): ${hero.skills.map((s) => s.name).join(", ")}`,
  };
}

export default function HeroPage({ params }: PageProps<"/heroes/[slug]">) {
  return (
    <>
      <Link href="/heroes" className="mb-4 inline-block text-sm text-muted hover:text-text">
        ← {t.heroes.title}
      </Link>
      <Suspense fallback={<HeroSkeleton />}>
        <Hero params={params} />
      </Suspense>
      <p className="mt-8 text-xs text-faint">{t.gameText.sourceNote}</p>
    </>
  );
}

async function Hero({ params }: { params: PageProps<"/heroes/[slug]">["params"] }) {
  const { slug } = await params;
  const hero = await getHeroBySlug(slug);
  if (hero === undefined) notFound();
  if (hero === null) return <Alert tone="danger">{t.heroes.loadError}</Alert>;

  const image = hero.portraitUrl ?? hero.headImageUrl;
  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-5 overflow-hidden sm:flex-row">
        {image ? (
          <div className="relative mx-auto aspect-square w-40 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:mx-0">
            <Image src={image} alt={hero.name} fill sizes="160px" className="object-cover" priority />
          </div>
        ) : null}
        <div className="min-w-0 space-y-3">
          <h1 className="font-display text-3xl font-extrabold">{hero.name}</h1>
          <div className="flex flex-wrap gap-1.5">
            {hero.roles.map((role) => (
              <Badge key={role} tone="gold">{role}</Badge>
            ))}
            {hero.lanes.map((lane) => (
              <Badge key={lane}>{lane}</Badge>
            ))}
            {hero.specialities.map((s) => (
              <Badge key={s} tone="electric">{s}</Badge>
            ))}
          </div>
          {hero.storyText ? (
            <div className="text-muted">
              <RichGameText text={hero.storyText.text} />
            </div>
          ) : null}
        </div>
      </Card>

      <section className="space-y-3">
        <CardTitle>{t.heroes.skills}</CardTitle>
        {hero.skills.map((skill) => {
          const costs = parseCdCost(skill.cdCost);
          return (
            <Card key={skill.id} className="space-y-3">
              <div className="flex items-start gap-3">
                {skill.iconUrl ? (
                  <Image src={skill.iconUrl} alt="" width={52} height={52} className="shrink-0 rounded-xl border border-border-strong" />
                ) : (
                  <div className="size-[52px] shrink-0 rounded-xl bg-surface-2" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{skill.name}</h2>
                    {skill.isPassive ? <Badge tone="violet">{t.heroes.passive}</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {costs.map((c) => (
                      <span key={c.label} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-electric">
                        {c.label} {c.value}
                      </span>
                    ))}
                    {skill.tags.map((tag) => (
                      <span key={tag} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <GameTextBlock value={skill.text} />
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-48" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-36" />
      ))}
    </div>
  );
}
