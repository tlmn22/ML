import type { Metadata } from "next";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getAccountByProfile } from "@/lib/services/accounts";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccountSection, ProfileForm, UnlinkSection } from "@/components/settings/settings-forms";
import { PageHeader, Skeleton } from "@/components/ui/primitives";

const t = getDictionary();

export const metadata: Metadata = { title: t.settings.title, robots: { index: false } };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.settings.title} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const profile = await requireProfile("/settings");
  const account = await getAccountByProfile(await createClient(), profile.id);
  return (
    <div className="space-y-5">
      <ProfileForm username={profile.username} displayName={profile.displayName} leaderboardOptIn={profile.leaderboardOptIn} />
      <UnlinkSection linked={Boolean(account)} />
      <DeleteAccountSection username={profile.username} />
    </div>
  );
}
