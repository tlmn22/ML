"use client";

import { useActionState, useTransition, useState } from "react";
import { deleteAccount, unlinkAccount, updateProfile, type ActionState } from "@/app/settings/actions";
import { getDictionary } from "@/lib/i18n";
import { Alert, Button, Card, CardTitle, Field, Input } from "@/components/ui/primitives";

const t = getDictionary();
const initial: ActionState = { ok: false, message: null };

export function ProfileForm({
  username,
  displayName,
  leaderboardOptIn,
}: {
  username: string;
  displayName: string | null;
  leaderboardOptIn: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <CardTitle>{t.settings.profileSection}</CardTitle>
        <Field label={t.settings.username} hint={t.settings.usernameHint}>
          <Input name="username" defaultValue={username} pattern="[a-z0-9_]{3,20}" required autoCapitalize="none" />
        </Field>
        <Field label={t.settings.displayName}>
          <Input name="displayName" defaultValue={displayName ?? ""} maxLength={40} />
        </Field>

        <CardTitle className="pt-2">{t.settings.privacySection}</CardTitle>
        <label className="flex gap-3 rounded-xl border border-border bg-bg-raised p-3">
          <input type="checkbox" name="leaderboardOptIn" defaultChecked={leaderboardOptIn} className="mt-0.5 size-4 shrink-0 accent-[var(--color-gold)]" />
          <span>
            <span className="block text-sm font-medium">{t.settings.optIn}</span>
            <span className="mt-1 block text-xs text-muted">{t.settings.optInHint}</span>
          </span>
        </label>

        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <Button type="submit" disabled={pending}>{pending ? t.common.loading : t.common.save}</Button>
      </form>
    </Card>
  );
}

export function UnlinkSection({ linked }: { linked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>(initial);
  if (!linked && !state.ok) return null;
  return (
    <Card className="space-y-3">
      <CardTitle>{t.settings.accountSection}</CardTitle>
      {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
      {!state.ok ? (
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t.settings.unlinkConfirm)) return;
            startTransition(async () => setState(await unlinkAccount()));
          }}
        >
          {t.settings.unlink}
        </Button>
      ) : null}
    </Card>
  );
}

export function DeleteAccountSection({ username }: { username: string }) {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  return (
    <Card className="space-y-3 border-danger/40">
      <CardTitle className="text-danger">{t.settings.dangerSection}</CardTitle>
      <p className="text-sm text-muted">{t.settings.deleteBody}</p>
      <form action={action} className="space-y-3">
        <Field label={t.settings.deleteConfirmLabel}>
          <Input name="confirm" placeholder={username} autoComplete="off" required />
        </Field>
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <Button type="submit" variant="danger" disabled={pending}>{t.settings.deleteButton}</Button>
      </form>
    </Card>
  );
}
