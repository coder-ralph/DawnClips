"use client";

import { Clock } from "lucide-react";
import type { PlayerController } from "@/components/video/video-player";
import { formatDuration } from "@/lib/video";
import type { ClipMoment } from "@/types/clips";

/** Tap a moment to jump the video to that timestamp. */
export function MomentChips({
  moments,
  controller,
  onJump,
}: {
  moments: ClipMoment[] | undefined;
  controller: React.RefObject<PlayerController | null>;
  /** Called after seeking, e.g. to make this card the active one. */
  onJump?: () => void;
}) {
  if (!moments || moments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Moments">
      {moments.map((moment) => (
        <li key={moment.id}>
          <button
            type="button"
            onClick={() => {
              controller.current?.seek(moment.at);
              onJump?.();
            }}
            aria-label={`Jump to ${moment.label} at ${formatDuration(moment.at)}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-medium hover:bg-active"
          >
            <Clock aria-hidden="true" className="h-3 w-3 text-accent-text" />
            <span className="tabular-nums text-accent-text">{formatDuration(moment.at)}</span>
            {moment.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
