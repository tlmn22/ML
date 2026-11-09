import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getDictionary } from "@/lib/i18n";
import { getPilotHeroes } from "@/lib/services/catalog";
import { Alert, Badge, Card, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.heroes.title, description: t.heroes.subtitle };

export default function HeroesPage() {
  return (
    <>
      <PageHeader title={t.heroes.title} subtitle={t.heroes.subtitle} />
      <Suspense fallback={<HeroGridSkeleton />}>
        <HeroGrid />
      </Suspense>
      <p className="mt-8 text-xs text-faint">{t.gameText.sourceNote}</p>
    </>
  );
}

async function HeroGrid() {
  const heroes = await getPilotHeroes();
  if (!heroes) return <Alert tone="danger">{t.heroes.loadError}</Alert>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {heroes.map((hero) => (
        <li key={hero.id}>
          <Link href={`/heroes/${hero.slug}`} className="group block h-full">
            <Card className="h-full overflow-hidden p-0 transition group-hover:border-gold/50 group-hover:shadow-glow-gold">
              <div className="relative aspect-square bg-surface-2">
                {hero.portraitUrl ?? hero.headImageUrl ? (
                  <Image
                    src={(hero.portraitUrl ?? hero.headImageUrl)!}
                    alt={hero.name}
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg/70 to-transparent p-3 pt-10">
                  <p className="font-display text-lg font-bold">{hero.name}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 p-3">
                {hero.roles.map((role) => (
                  <Badge key={role} tone="gold">{role}</Badge>
                ))}
                {hero.lanes.map((lane) => (
                  <Badge key={lane}>{lane}</Badge>
                ))}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HeroGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4]" />
      ))}
    </div>
  );
}
