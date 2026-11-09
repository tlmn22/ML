import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title={t.admin.overview} />
      <Suspense fallback={<Skeleton className="h-28" />}>
        <Counts />
      </Suspense>
    </>
  );
}

async function Counts() {
  await requireAdmin();
  const db = createAdminClient();
  const count = async (table: string, filter?: [string, string]) => {
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.eq(filter[0], filter[1]);
    return (await q).count ?? 0;
  };
  const [users, accounts, pending] = await Promise.all([
    count("profiles"),
    count("mlbb_accounts"),
    count("mlbb_verification_attempts", ["status", "pending_review"]),
  ]);
  const stats = [
    [t.admin.users, users],
    [t.admin.accounts, accounts],
    [t.admin.pending, pending],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map(([label, value]) => (
        <Card key={label}>
          <p className="text-xs uppercase tracking-wider text-faint">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold">{value}</p>
        </Card>
      ))}
    </div>
  );
}
