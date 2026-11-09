"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import { Button } from "@/components/ui/primitives";

const t = getDictionary();

const MESSAGES: Record<string, string> = {
  cooldown: t.dashboard.cooldown,
  reauth_required: t.dashboard.reauthBody,
  provider_unavailable: t.link.errors.provider_unavailable,
};

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; message: string | null }>({ pending: false, message: null });

  async function refresh() {
    setState({ pending: true, message: null });
    const res = await fetch("/api/mlbb/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    if (res?.ok) {
      setState({ pending: false, message: t.dashboard.refreshed });
      router.refresh();
      return;
    }
    const body = await res?.json().catch(() => null);
    setState({ pending: false, message: MESSAGES[body?.error] ?? t.common.unknownError });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={refresh} disabled={state.pending}>
        {state.pending ? t.dashboard.refreshing : `↻ ${t.dashboard.refresh}`}
      </Button>
      {state.message ? (
        <p role="status" className="max-w-56 text-right text-xs text-muted">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
