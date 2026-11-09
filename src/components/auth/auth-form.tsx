"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/safe-redirect";
import { getDictionary } from "@/lib/i18n";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";

const t = getDictionary();

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? t.auth.authError : null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isSupabaseConfigured()) {
    return <Alert tone="warning" title={t.auth.notConfigured} />;
  }

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setPending(false);
      if (error) return setError(t.auth.invalidCredentials);
      router.replace(next);
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl() } });
      setPending(false);
      // Same message whether or not the email exists, to avoid account enumeration.
      if (error && error.status !== 400) return setError(t.common.unknownError);
      if (error) return setError(error.message);
      setNotice(t.auth.registerSent);
    }
  }

  async function onGoogle() {
    setPending(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setPending(false);
      setError(t.auth.authError);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md space-y-5 p-6">
      <h1 className="font-display text-2xl font-bold">{mode === "login" ? t.auth.loginTitle : t.auth.registerTitle}</h1>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Button type="button" variant="secondary" className="w-full" onClick={onGoogle} disabled={pending}>
        <span aria-hidden className="font-bold text-electric">G</span> {t.auth.google}
      </Button>

      <div className="flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-border" />
        {t.auth.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t.auth.email}>
          <Input name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field label={t.auth.password} hint={mode === "register" ? t.auth.passwordHint : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={72}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.common.loading : mode === "login" ? t.auth.submitLogin : t.auth.submitRegister}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? t.auth.noAccount : t.auth.haveAccount}{" "}
        <Link
          href={`${mode === "login" ? "/register" : "/login"}?next=${encodeURIComponent(next)}`}
          className="font-semibold text-electric hover:underline"
        >
          {mode === "login" ? t.nav.register : t.nav.login}
        </Link>
      </p>
    </Card>
  );
}
