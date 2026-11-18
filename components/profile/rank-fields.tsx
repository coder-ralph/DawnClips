"use client";

import { useId, useState } from "react";
import { RankBadge } from "@/components/profile/rank-badge";
import { inputClass } from "@/components/ui/field";
import { isRank, maxRankStars, rankInfo, ranks, starRangeText, starsError } from "@/lib/mlbb-profile";

/**
 * Highest rank and its stars for the Edit profile form. Stars are counted from Mythic up, each rank with its own range
 * (Mythic 0–24 … Mythical Immortal 100+), so the stars box is only active for those ranks and its limits follow the
 * rank. Submitted as `highestRank` and `rankStars`; the server checks the same rules again.
 */
export function HighestRankFields({ defaultRank, defaultStars }: { defaultRank: string | null; defaultStars: number | null }) {
  const rankId = useId();
  const starsId = useId();
  const hintId = useId();
  const [rank, setRank] = useState(isRank(defaultRank) ? defaultRank : "");
  const [stars, setStars] = useState(defaultStars === null ? "" : String(defaultStars));
  const info = rankInfo(rank);
  const range = info?.stars;
  const error = range ? starsError(rank, stars) : null;
  const hint = error ?? (range ? starRangeText(rank) : info ? "Stars are counted from Mythic up." : "Pick a rank to add stars.");

  return (
    <div>
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-3">
        <label htmlFor={rankId} className="text-sm font-medium">Highest rank <span className="font-normal text-muted">(optional)</span></label>
        {info ? <RankBadge rank={info.value} /> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9.5rem]">
        <select id={rankId} name="highestRank" value={rank} onChange={(event) => setRank(event.target.value)} className={inputClass}>
          <option value="">Not set</option>
          {ranks.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <div>
          <label htmlFor={starsId} className="sr-only">Stars</label>
          <input
            id={starsId}
            name="rankStars"
            type="number"
            inputMode="numeric"
            step={1}
            min={range?.min}
            max={range?.max ?? maxRankStars}
            placeholder="Stars"
            // A rank without a star count (or no rank) leaves the box empty and out of the form.
            value={range ? stars : ""}
            disabled={!range}
            aria-describedby={hintId}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setStars(event.target.value)}
            // Whole numbers only: no sign, decimal point or exponent.
            onKeyDown={(event) => {
              if (["-", "+", ".", ",", "e", "E"].includes(event.key)) event.preventDefault();
            }}
            onWheel={(event) => event.currentTarget.blur()}
            className={inputClass}
          />
        </div>
      </div>
      <p id={hintId} role={error ? "alert" : undefined} className={`mt-1.5 text-xs leading-5 ${error ? "text-danger" : "text-muted"}`}>
        {hint}
      </p>
    </div>
  );
}
