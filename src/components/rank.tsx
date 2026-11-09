import Image from "next/image";
import { RANK_TIERS, decodeRankLevel, toRoman } from "@/lib/mlbb/ranks";
import { cn } from "@/components/ui/primitives";

export function RankEmblem({ level, size = 48, className }: { level: number | null; size?: number; className?: string }) {
  const rank = decodeRankLevel(level);
  if (!rank) {
    return (
      <div
        aria-label="Unranked"
        style={{ width: size, height: size }}
        className={cn("grid place-items-center rounded-full border border-border-strong bg-surface-2 text-faint", className)}
      >
        ?
      </div>
    );
  }
  return (
    <Image
      src={rank.icon}
      alt={rank.tierName}
      width={size}
      height={size}
      className={cn("drop-shadow-[0_4px_16px_rgba(245,196,81,0.25)]", className)}
    />
  );
}

export function RankSummary({ level, size = "md" }: { level: number | null; size?: "md" | "lg" }) {
  const rank = decodeRankLevel(level);
  const emblem = size === "lg" ? 88 : 44;
  return (
    <div className="flex items-center gap-4">
      <RankEmblem level={level} size={emblem} />
      <div className="min-w-0">
        <p className={cn("font-display font-bold", size === "lg" ? "text-2xl sm:text-3xl" : "text-base")}>
          {rank ? (
            <>
              {rank.tierName}
              {rank.division ? ` ${toRoman(rank.division)}` : ""}
            </>
          ) : (
            "—"
          )}
        </p>
        {rank ? (
          <p className={cn("text-gold", size === "lg" ? "text-lg" : "text-sm")}>
            ★ {rank.stars}
            {rank.maxStars !== null ? <span className="text-faint"> / {rank.maxStars}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WeeklyChange({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-faint">—</span>;
  if (value === 0) return <span className="text-muted">0</span>;
  return value > 0 ? (
    <span className="font-semibold text-success">▲ {value}</span>
  ) : (
    <span className="font-semibold text-danger">▼ {Math.abs(value)}</span>
  );
}

export interface RankPoint {
  capturedAt: string;
  rankLevel: number;
}

/** Rank level over time with tier boundaries as guides. Pure SVG, server-rendered. */
export function RankChart({ points, height = 220 }: { points: RankPoint[]; height?: number }) {
  if (points.length < 2) return null;
  const width = 640;
  const pad = { top: 16, right: 12, bottom: 28, left: 12 };
  const times = points.map((p) => new Date(p.capturedAt).getTime());
  const levels = points.map((p) => p.rankLevel);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const lMin = Math.max(0, Math.min(...levels) - 3);
  const lMax = Math.max(...levels) + 3;

  const x = (t: number) => pad.left + ((t - tMin) / Math.max(1, tMax - tMin)) * (width - pad.left - pad.right);
  const y = (l: number) => pad.top + (1 - (l - lMin) / Math.max(1, lMax - lMin)) * (height - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(p.rankLevel).toFixed(1)}`).join(" ");
  const area = `${line} L${x(tMax).toFixed(1)},${height - pad.bottom} L${x(tMin).toFixed(1)},${height - pad.bottom} Z`;
  const guides = RANK_TIERS.filter((t) => t.start > lMin && t.start < lMax);
  const fmt = (t: number) => new Date(t).toLocaleDateString("mn-MN", { month: "2-digit", day: "2-digit", timeZone: "Asia/Ulaanbaatar" });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rank progression chart" className="h-auto w-full">
      <defs>
        <linearGradient id="rank-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {guides.map((g) => (
        <g key={g.tier}>
          <line x1={pad.left} x2={width - pad.right} y1={y(g.start)} y2={y(g.start)} stroke="var(--color-border-strong)" strokeDasharray="4 6" />
          <text x={width - pad.right} y={y(g.start) - 4} textAnchor="end" fontSize="11" fill="var(--color-faint)">
            {g.name}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#rank-area)" />
      <path d={line} fill="none" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(times[i])} cy={y(p.rankLevel)} r="3.5" fill="var(--color-bg)" stroke="var(--color-gold)" strokeWidth="2">
          <title>{`${fmt(times[i])}: ${decodeRankLevel(p.rankLevel)?.label ?? p.rankLevel}`}</title>
        </circle>
      ))}
      <text x={pad.left} y={height - 8} fontSize="11" fill="var(--color-faint)">{fmt(tMin)}</text>
      <text x={width - pad.right} y={height - 8} fontSize="11" fill="var(--color-faint)" textAnchor="end">{fmt(tMax)}</text>
    </svg>
  );
}
