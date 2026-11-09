import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-gold to-gold-strong text-[#1a1300] shadow-glow-gold hover:brightness-110",
  secondary: "border border-border-strong bg-surface-2 text-text hover:border-electric/60 hover:bg-surface",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-border bg-surface/80 p-5 backdrop-blur", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("font-display text-sm font-semibold uppercase tracking-wider text-muted", className)} {...props} />;
}

type BadgeTone = "neutral" | "gold" | "electric" | "violet" | "success" | "danger" | "warning";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-border-strong bg-surface-2 text-muted",
  gold: "border-gold/40 bg-gold/10 text-gold",
  electric: "border-electric/40 bg-electric/10 text-electric",
  violet: "border-violet/40 bg-violet/10 text-violet",
  success: "border-success/40 bg-success/10 text-success",
  danger: "border-danger/40 bg-danger/10 text-danger",
  warning: "border-warning/40 bg-warning/10 text-warning",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-text">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-bg-raised px-3.5 text-base text-text placeholder:text-faint focus:border-electric focus:outline-none focus:ring-2 focus:ring-electric/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Alert({
  tone = "neutral",
  title,
  children,
  className,
}: {
  tone?: "neutral" | "danger" | "warning" | "success";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "border-border-strong bg-surface-2",
    danger: "border-danger/40 bg-danger/10",
    warning: "border-warning/40 bg-warning/10",
    success: "border-success/40 bg-success/10",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border p-4 text-sm", tones[tone], className)}>
      {title ? <p className="font-semibold text-text">{title}</p> : null}
      {children ? <div className={cn("text-muted", title && "mt-1")}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-border-strong px-6 py-12 text-center">
      <div aria-hidden className="mb-4 grid size-12 place-items-center rounded-full bg-surface-2 text-xl text-gold">◆</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}
