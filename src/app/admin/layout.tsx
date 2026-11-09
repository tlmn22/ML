import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { Alert, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.admin.title, robots: { index: false } };

const LINKS = [
  { href: "/admin", label: t.admin.overview },
  { href: "/admin/verifications", label: t.admin.verifications },
  { href: "/admin/sync", label: t.admin.sync },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            {l.label}
          </Link>
        ))}
      </nav>
      <Alert tone="warning">{t.admin.integrationWarning}</Alert>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
