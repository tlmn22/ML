import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewManualRequest } from "../actions";
import { Button, Card, EmptyState, Field, Input, PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export default function VerificationsPage() {
  return (
    <>
      <PageHeader title={t.admin.verifications} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <PendingRequests />
      </Suspense>
    </>
  );
}

async function PendingRequests() {
  await requireAdmin();
  const { data } = await createAdminClient()
    .from("mlbb_verification_attempts")
    .select("id, role_id, zone_id, user_note, created_at, profiles!mlbb_verification_attempts_profile_id_fkey(username)")
    .eq("status", "pending_review")
    .order("created_at")
    .limit(50);

  const rows = (data ?? []) as unknown as {
    id: string;
    role_id: number;
    zone_id: number;
    user_note: string | null;
    created_at: string;
    profiles: { username: string } | null;
  }[];
  if (rows.length === 0) return <EmptyState title={t.admin.noPending} />;

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">@{r.profiles?.username ?? "?"}</p>
            <p className="text-xs text-faint">{formatDateTime(r.created_at)}</p>
          </div>
          <p className="font-mono text-sm">
            {r.role_id} ({r.zone_id})
          </p>
          {r.user_note ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{r.user_note}</p> : null}
          <form action={reviewManualRequest} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end">
            <input type="hidden" name="attemptId" value={r.id} />
            <Field label={t.admin.reviewNote}>
              <Input name="note" maxLength={500} />
            </Field>
            <Field label={t.admin.rankLevel}>
              <Input name="rankLevel" inputMode="numeric" pattern="\d{1,4}" />
            </Field>
            <Button type="submit" name="decision" value="approve">{t.admin.approve}</Button>
            <Button type="submit" name="decision" value="reject" variant="danger">{t.admin.reject}</Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
