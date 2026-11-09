import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { getDictionary } from "@/lib/i18n";
import { getPilotItems } from "@/lib/services/catalog";
import { GameTextBlock } from "@/components/game-text";
import { Alert, Badge, Card, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.items.title, description: t.items.subtitle };

export default function ItemsPage() {
  return (
    <>
      <PageHeader title={t.items.title} subtitle={t.items.subtitle} />
      <Suspense fallback={<ItemsSkeleton />}>
        <Items />
      </Suspense>
      <p className="mt-8 text-xs text-faint">{t.gameText.sourceNote}</p>
    </>
  );
}

async function Items() {
  const items = await getPilotItems();
  if (!items) return <Alert tone="danger">{t.items.loadError}</Alert>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="h-full space-y-4">
            <div className="flex items-center gap-3">
              {item.iconUrl ? (
                <Image src={item.iconUrl} alt="" width={56} height={56} className="shrink-0 rounded-xl border border-border-strong" />
              ) : (
                <div className="size-14 shrink-0 rounded-xl bg-surface-2" />
              )}
              <div>
                <h2 className="font-display text-lg font-bold">{item.name}</h2>
                {item.category ? <Badge tone="gold">{t.items.categories[item.category]}</Badge> : null}
              </div>
            </div>
            {item.stats.length ? (
              <ul className="grid gap-1 rounded-xl bg-bg-raised p-3 font-mono text-sm text-success">
                {item.stats.map((stat) => (
                  <li key={stat}>{stat}</li>
                ))}
              </ul>
            ) : null}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">{t.items.passive}</p>
              {item.passiveText ? <GameTextBlock value={item.passiveText} /> : <p className="text-sm text-muted">{t.items.noPassive}</p>}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ItemsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-56" />
      ))}
    </div>
  );
}
