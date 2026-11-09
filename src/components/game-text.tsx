import type { ReactNode } from "react";
import { getDictionary } from "@/lib/i18n";
import type { GameText as GameTextValue } from "@/lib/i18n/game-text";
import { Badge } from "@/components/ui/primitives";

const t = getDictionary();

// Provider markup we understand. Everything else is rendered as plain (escaped) text.
const TOKEN = /<font color="([0-9a-fA-F]{6})">([\s\S]*?)<\/font>|<br\s*\/?>|\n|<(\d{3,5})>/g;

function UnknownStat() {
  return (
    <abbr title={t.gameText.unknownStat} className="mx-0.5 rounded border border-dashed border-border-strong px-1 text-xs text-muted no-underline">
      ?
    </abbr>
  );
}

function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) {
      out.push(
        <span key={k} style={{ color: `#${m[1]}` }} className="font-medium">
          {renderInline(m[2], k)}
        </span>,
      );
    } else if (m[3]) {
      out.push(<UnknownStat key={k} />);
    } else {
      out.push(<br key={k} />);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders provider rich text (colored spans, line breaks, unknown-stat placeholders) safely. */
export function RichGameText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text/90">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i}>{renderInline(paragraph.trim(), `p${i}`)}</p>
      ))}
    </div>
  );
}

/** Localized game text with its translation state, plus the English original on demand. */
export function GameTextBlock({ value }: { value: GameTextValue }) {
  return (
    <div className="space-y-2">
      {value.state === "outdated" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">{t.gameText.outdated}</p>
      ) : null}
      <div lang={value.lang}>
        <RichGameText text={value.text} />
      </div>
      {value.state === "translated" ? (
        <div className="flex flex-wrap items-center gap-2">
          {value.review === "reviewed" ? (
            <Badge tone="success">✓ {t.gameText.reviewed}</Badge>
          ) : (
            <Badge tone="violet">{t.gameText.aiDraft}</Badge>
          )}
          <details className="group w-full">
            <summary className="cursor-pointer list-none text-xs font-medium text-faint hover:text-muted">
              {t.gameText.original} <span aria-hidden>▾</span>
            </summary>
            <div lang="en" className="mt-2 rounded-lg border border-border bg-bg-raised p-3">
              <RichGameText text={value.original} />
            </div>
          </details>
        </div>
      ) : value.state === "missing" ? (
        <p className="text-xs text-faint">{t.gameText.missing}</p>
      ) : null}
    </div>
  );
}
