"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Source = { url: string; poster: string | null; expiresAt: string | null };

/** Playback links are reused between thumbnails (the same clip can appear in several lists). */
const sources = new Map<string, Source>();

const fresh = (source: Source | undefined): source is Source =>
  Boolean(source && (!source.expiresAt || new Date(source.expiresAt).getTime() - Date.now() > 60_000));

/**
 * 16:9 thumbnail. Uses the clip's poster image when it has one. Otherwise it fetches the playback link
 * shortly before the thumbnail scrolls into view and shows the first frame of the video, so clips
 * uploaded without a poster still get a real preview instead of a black box.
 */
export function ClipThumb({ src, clipId, className }: { src?: string | null; clipId?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  const needsFetch = !src && Boolean(clipId);

  useEffect(() => {
    const node = ref.current;
    if (!node || !needsFetch || !clipId || typeof IntersectionObserver === "undefined") return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const cached = sources.get(clipId);
        if (fresh(cached)) {
          setSource(cached);
          return;
        }
        fetch(`/api/clips/${clipId}/playback`)
          .then((response) => (response.ok ? (response.json() as Promise<Source>) : null))
          .then((next) => {
            if (!next?.url) throw new Error("no source");
            sources.set(clipId, next);
            if (!cancelled) setSource(next);
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [needsFetch, clipId]);

  const image = src ?? source?.poster ?? null;

  return (
    <div ref={ref} className={cn("relative aspect-video overflow-hidden bg-card", className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : source && !failed ? (
        <video
          src={`${source.url}#t=0.001`}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          disablePictureInPicture
          onError={() => setFailed(true)}
          className="pointer-events-none h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted">
          <Play aria-hidden="true" className="h-7 w-7" />
        </span>
      )}
      {/* A small play mark over a video frame signals that the tile opens a clip. */}
      {!image && source && !failed ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
