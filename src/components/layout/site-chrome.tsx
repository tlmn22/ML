import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDictionary } from "@/lib/i18n";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ButtonLink, Skeleton } from "@/components/ui/primitives";
import { DesktopNav, DesktopNavLinks, MobileTabBar, MobileTabLinks, type NavItem } from "./nav-links";

const t = getDictionary();

const NAV: NavItem[] = [
  { href: "/", label: t.nav.home, icon: "⌂" },
  { href: "/heroes", label: t.nav.heroes, icon: "⚔" },
  { href: "/items", label: t.nav.items, icon: "◆" },
  { href: "/leaderboard", label: t.nav.leaderboard, icon: "♛" },
  { href: "/dashboard", label: t.nav.dashboard, icon: "◈" },
];

async function UserMenu() {
  const profile = isSupabaseConfigured() ? await getCurrentProfile() : null;
  if (!profile) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="ghost" size="sm">{t.nav.login}</ButtonLink>
        <ButtonLink href="/register" size="sm">{t.nav.register}</ButtonLink>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {profile.role === "admin" ? (
        <ButtonLink href="/admin" variant="ghost" size="sm">{t.nav.admin}</ButtonLink>
      ) : null}
      <Link
        href={`/players/${profile.username}`}
        className="hidden max-w-36 truncate rounded-lg px-2 py-1 text-sm text-muted hover:text-text sm:block"
      >
        @{profile.username}
      </Link>
      <Link href="/settings" aria-label={t.nav.settings} title={t.nav.settings} className="rounded-lg px-2 py-1 text-muted hover:text-text">
        ⚙
      </Link>
      <form action="/auth/signout" method="post">
        <button type="submit" className="rounded-lg px-2 py-1 text-sm text-muted hover:text-text">
          {t.nav.logout}
        </button>
      </form>
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
            <span className="text-gradient-gold">ML</span> Mongolia
          </Link>
          <Suspense fallback={<DesktopNavLinks items={NAV} pathname={null} />}>
            <DesktopNav items={NAV} />
          </Suspense>
        </div>
        <Suspense fallback={<Skeleton className="h-9 w-32" />}>
          <UserMenu />
        </Suspense>
      </div>
    </header>
  );
}

export function SiteTabBar() {
  return (
    <Suspense fallback={<MobileTabLinks items={NAV} pathname={null} />}>
      <MobileTabBar items={NAV} />
    </Suspense>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-28 pt-12 text-xs text-faint md:pb-12">
      <p>
        {t.common.attribution}{" "}
        <a href="https://arena.rone.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted">
          arena.rone.dev
        </a>
      </p>
      <p className="mt-1">Mobile Legends: Bang Bang is a trademark of Moonton.</p>
    </footer>
  );
}

/**
 * Shown on every page whenever the mock provider is active. Read at request time
 * (not baked in at build), so a build reused with different env can never hide it.
 */
export function DemoBanner() {
  return (
    <Suspense fallback={null}>
      <RuntimeDemoBanner />
    </Suspense>
  );
}

async function RuntimeDemoBanner() {
  await connection();
  if (process.env.MLBB_PROVIDER !== "mock") return null;
  return (
    <div role="status" className="bg-warning/15 px-4 py-2 text-center text-xs font-semibold text-warning">
      {t.common.demoBanner}
    </div>
  );
}
