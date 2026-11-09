"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/primitives";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Pure renderers: used as the prerendered Suspense fallback (no active state) and by the live versions. */
export function DesktopNavLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive(pathname, item.href) ? "bg-surface-2 text-gold" : "text-muted hover:text-text",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTabLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-gold" : "text-muted",
                )}
              >
                <span aria-hidden className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  return <DesktopNavLinks items={items} pathname={usePathname()} />;
}

export function MobileTabBar({ items }: { items: NavItem[] }) {
  return <MobileTabLinks items={items} pathname={usePathname()} />;
}
