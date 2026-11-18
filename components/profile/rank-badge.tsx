import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { rankLabel, type RankValue } from "@/lib/mlbb-profile";

/**
 * One look per rank: a gradient frame, the rank's colour as a soft breathing glow (`glow` is an "r g b" triple read by
 * .rank-badge in globals.css) and a slow shimmer sweep. Colours follow the in-game medals. Master is not on the
 * reference sheet, so it takes the blue-violet between Elite's steel and Grandmaster's sky blue.
 * Full class strings, so Tailwind can see them.
 */
const STYLE: Record<RankValue, { frame: string; text: string; glow: string }> = {
  warrior: { frame: "from-amber-600 via-orange-300 to-amber-700", text: "text-amber-200", glow: "205 140 60" },
  elite: { frame: "from-slate-200 via-slate-400 to-slate-500", text: "text-slate-200", glow: "148 163 184" },
  master: { frame: "from-indigo-200 via-indigo-400 to-violet-500", text: "text-indigo-200", glow: "129 140 248" },
  grandmaster: { frame: "from-sky-200 via-sky-400 to-blue-500", text: "text-sky-200", glow: "56 189 248" },
  epic: { frame: "from-emerald-200 via-teal-400 to-emerald-600", text: "text-teal-200", glow: "45 212 191" },
  legend: { frame: "from-amber-200 via-amber-400 to-red-500", text: "text-amber-200", glow: "245 158 11" },
  mythic: { frame: "from-fuchsia-300 via-violet-400 to-purple-500", text: "text-violet-200", glow: "192 132 252" },
  mythical_honor: { frame: "from-cyan-200 via-sky-300 to-cyan-500", text: "text-cyan-100", glow: "34 211 238" },
  mythical_glory: { frame: "from-yellow-200 via-orange-400 to-orange-600", text: "text-orange-200", glow: "251 146 60" },
  mythical_immortal: { frame: "from-yellow-100 via-yellow-300 to-amber-400", text: "text-yellow-100", glow: "250 204 21" },
};

/**
 * Highest-rank badge: the rank name as text, nothing else. The pill is dark in both themes (like a game medal), so
 * the tier colours read the same everywhere. Glow and shimmer stop for people who prefer reduced motion.
 */
export function RankBadge({ rank, className }: { rank: RankValue; className?: string }) {
  const style = STYLE[rank];
  return (
    <span
      className={cn("rank-badge inline-flex shrink-0 rounded-md bg-linear-to-r p-[1.5px]", style.frame, className)}
      style={{ "--glow": style.glow } as CSSProperties}
    >
      <span className="relative flex items-center overflow-hidden rounded-[5px] bg-neutral-950 px-2 py-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.12em] sm:text-[11px]">
        <span className={style.text}>{rankLabel(rank)}</span>
        <span className="rank-badge-shine pointer-events-none absolute inset-0" aria-hidden="true" />
      </span>
    </span>
  );
}
