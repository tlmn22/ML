import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerRankSync } from "../actions";
import { Badge, Button, Card, CardTitle, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export default function SyncPage() {
  return (
    <>
      <PageHeader
        title={t.admin.sync}
        actions={
          <form action={triggerRankSync}>
            <Button type="submit" size="sm">{t.admin.runSync}</Button>
          </form>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Jobs />
      </Suspense>
    </>
  );
}

async function Jobs() {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: jobs }, { data: accounts }] = await Promise.all([
    db.from("sync_jobs").select("id, kind, status, triggered_by, processed, succeeded, failed, error, started_at, finished_at").order("started_at", { ascending: false }).limit(25),
    db.from("mlbb_accounts").select("status, last_sync_status"),
  ]);

  const tally = (accounts ?? []).reduce<Record<string, number>>((acc, a) => {
    const key = a.status === "reauth_required" ? "reauth_required" : (a.last_sync_status ?? "never");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const tone = { succeeded: "success", partial: "warning", failed: "danger", running: "electric" } as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {Object.entries(tally).map(([k, v]) => (
          <Badge key={k} tone={k === "ok" ? "success" : k === "reauth_required" || k === "error" ? "warning" : "neutral"}>
            {k}: {v}
          </Badge>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <CardTitle className="px-4 pt-4">{t.admin.jobs}</CardTitle>
        {!jobs?.length ? (
          <div className="p-4"><EmptyState title="—" /></div>
        ) : (
          <table className="mt-2 w-full min-w-[40rem] text-sm">
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(j.started_at)}</td>
                  <td className="px-4 py-3">{j.kind}</td>
                  <td className="px-4 py-3"><Badge tone={tone[j.status as keyof typeof tone]}>{j.status}</Badge></td>
                  <td className="px-4 py-3 text-muted">{j.triggered_by}</td>
                  <td className="px-4 py-3 font-mono">{j.succeeded}/{j.processed} ✓ · {j.failed} ✗</td>
                  <td className="max-w-64 truncate px-4 py-3 text-xs text-danger" title={j.error ?? undefined}>{j.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
