"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCachedPlayback } from "@/lib/playback-cache";

/**
 * Shown while the clip page renders on the server. When the visitor came from a feed card, the poster that card
 * was showing is already in memory, so the video area keeps the same picture instead of turning black.
 */
export function ClipViewerSkeleton() {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    const id = window.location.pathname.match(/\/clip\/([0-9a-f-]{36})/i)?.[1];
    const known = id ? getCachedPlayback(id)?.poster ?? null : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state after hydration
    if (known) setPoster(known);
  }, []);

  return (
    <div role="status" aria-label="Loading clip" className="fixed inset-0 z-50 flex flex-col bg-black landscape-short:flex-row lg:flex-row">
      <div className="relative h-[40dvh] shrink-0 bg-black landscape-short:h-auto landscape-short:flex-1 lg:h-auto lg:flex-1">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="h-full w-full object-contain" />
        ) : null}
        <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
        </div>
      </div>
      <div className="flex-1 space-y-4 bg-background p-4 landscape-short:w-[min(380px,42vw)] landscape-short:flex-none lg:w-[420px] lg:flex-none">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
