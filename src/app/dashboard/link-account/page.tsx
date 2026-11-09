import type { Metadata } from "next";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { LinkAccountFlow } from "@/components/link-account/link-account-flow";
import { PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.link.title, robots: { index: false } };

export default function LinkAccountPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t.link.title} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AuthorizedFlow />
      </Suspense>
    </div>
  );
}

async function AuthorizedFlow() {
  await requireProfile("/dashboard/link-account");
  return <LinkAccountFlow />;
}
