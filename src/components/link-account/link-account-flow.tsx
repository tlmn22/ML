"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getDictionary } from "@/lib/i18n";
import { Alert, Button, ButtonLink, Card, Field, Input, inputClass } from "@/components/ui/primitives";

const t = getDictionary();

type Step =
  | { name: "form" }
  | { name: "code"; attemptId: string; expiresAt: number; roleId: string; zoneId: string }
  | { name: "success"; transferred: boolean; nickname: string | null; rank: string | null };

function errorMessage(code: unknown): string {
  return (typeof code === "string" && t.link.errors[code as keyof typeof t.link.errors]) || t.common.unknownError;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, data: { error: "provider_unavailable" } };
  }
}

function useSecondsLeft(expiresAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
}

export function LinkAccountFlow() {
  const [step, setStep] = useState<Step>({ name: "form" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(step.name === "code" ? step.expiresAt : null);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roleId = String(form.get("roleId") ?? "").trim();
    const zoneId = String(form.get("zoneId") ?? "").trim();
    setPending(true);
    setError(null);
    const { ok, data } = await postJson("/api/mlbb/verification/start", {
      roleId,
      zoneId,
      consent: form.get("consent") === "on",
    });
    setPending(false);
    if (!ok) return setError(errorMessage(data.error));
    setStep({
      name: "code",
      attemptId: String(data.attemptId),
      expiresAt: Date.now() + Number(data.expiresInSeconds) * 1000,
      roleId,
      zoneId,
    });
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== "code") return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { ok, data } = await postJson("/api/mlbb/verification/complete", { attemptId: step.attemptId, code });
    setPending(false);
    if (!ok) {
      const terminal = ["attempt_expired", "attempt_not_found", "too_many_submissions", "identity_mismatch"];
      if (terminal.includes(String(data.error))) setStep({ name: "form" });
      return setError(errorMessage(data.error));
    }
    setStep({
      name: "success",
      transferred: Boolean(data.transferred),
      nickname: (data.nickname as string | null) ?? null,
      rank: (data.rank as string | null) ?? null,
    });
  }

  if (step.name === "success") {
    return (
      <Card className="animate-fade-up space-y-4 text-center shadow-glow-gold">
        <div aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-2xl text-success">✓</div>
        <h2 className="font-display text-xl font-bold">{t.link.successTitle}</h2>
        {step.nickname ? <p className="text-lg font-semibold">{step.nickname}</p> : null}
        {step.rank ? <p className="text-gold">{step.rank}</p> : null}
        {step.transferred ? <Alert tone="warning">{t.link.successTransferred}</Alert> : null}
        <ButtonLink href="/dashboard" className="w-full">{t.link.goDashboard}</ButtonLink>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {step.name === "form" ? (
        <Card>
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-sm text-muted">{t.link.intro}</p>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label={t.link.roleId}>
                <Input name="roleId" inputMode="numeric" pattern="\d{1,11}" autoComplete="off" required placeholder="1234567890" />
              </Field>
              <Field label={t.link.zoneId}>
                <Input name="zoneId" inputMode="numeric" pattern="\d{1,6}" autoComplete="off" required placeholder="1234" />
              </Field>
            </div>
            <p className="text-xs text-faint">{t.link.whereToFind}</p>
            <label className="flex gap-3 rounded-xl border border-border bg-bg-raised p-3 text-xs text-muted">
              <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-[var(--color-gold)]" />
              <span>{t.link.consent}</span>
            </label>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t.link.sending : t.link.sendCode}
            </Button>
            <p className="text-center text-xs font-semibold text-gold">🔒 {t.link.noPassword}</p>
          </form>
        </Card>
      ) : (
        <Card className="shadow-glow-electric">
          <form onSubmit={verify} className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold">{t.link.codeTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.link.codeBody}</p>
              <p className="mt-1 font-mono text-xs text-faint">
                {step.roleId} ({step.zoneId})
              </p>
            </div>
            <Field label={t.link.code}>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4,6}"
                maxLength={6}
                required
                autoFocus
                className={`${inputClass} h-14 text-center font-mono text-2xl tracking-[0.5em]`}
              />
            </Field>
            <p className={`text-sm ${secondsLeft > 0 ? "text-muted" : "text-danger"}`}>
              {secondsLeft > 0
                ? `${t.link.expiresIn}: ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                : t.link.expired}
            </p>
            <Button type="submit" className="w-full" disabled={pending || secondsLeft === 0}>
              {pending ? t.link.verifying : t.link.verify}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setError(null); setStep({ name: "form" }); }}>
              {t.link.startOver}
            </Button>
          </form>
        </Card>
      )}

      <ManualRequest />
    </div>
  );
}

function ManualRequest() {
  const [state, setState] = useState<{ pending: boolean; message: string | null; ok: boolean }>({ pending: false, message: null, ok: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ pending: true, message: null, ok: false });
    const { ok, data } = await postJson("/api/mlbb/verification/manual", {
      roleId: String(form.get("roleId") ?? "").trim(),
      zoneId: String(form.get("zoneId") ?? "").trim(),
      note: String(form.get("note") ?? ""),
    });
    setState({ pending: false, ok, message: ok ? t.link.manualSent : errorMessage(data.error) });
  }

  return (
    <details className="group rounded-[var(--radius-card)] border border-border bg-surface/60 p-5">
      <summary className="cursor-pointer list-none font-semibold text-muted group-open:text-text">
        {t.link.manualTitle} <span aria-hidden className="text-faint">▾</span>
      </summary>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <p className="text-sm text-muted">{t.link.manualBody}</p>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label={t.link.roleId}>
            <Input name="roleId" inputMode="numeric" pattern="\d{1,11}" required />
          </Field>
          <Field label={t.link.zoneId}>
            <Input name="zoneId" inputMode="numeric" pattern="\d{1,6}" required />
          </Field>
        </div>
        <Field label={t.link.manualNote}>
          <textarea name="note" maxLength={500} rows={3} className={`${inputClass} h-auto py-2`} />
        </Field>
        {state.message ? <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert> : null}
        <Button type="submit" variant="secondary" className="w-full" disabled={state.pending || state.ok}>
          {t.link.manualSubmit}
        </Button>
      </form>
    </details>
  );
}
