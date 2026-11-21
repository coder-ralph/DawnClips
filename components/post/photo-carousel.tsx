"use client";

import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { carouselRatio } from "@/lib/carousel";
import { cn } from "@/lib/utils";
import type { PostImage } from "@/types/clips";

/**
 * The images of a photo post, one at a time. Every image keeps its own aspect ratio (nothing is cropped to a shared
 * shape): the frame follows the image that is showing, and a portrait or landscape image is letterboxed inside it.
 *
 * Swiping and scrolling are the browser's own scroll-snap, so touch works without handlers; the arrows, the keyboard
 * and the position counter drive the same scroller.
 *
 * `inline` sizes the frame to the current image (feed cards); `fill` fills the box it is placed in (the post viewer).
 */
export function PhotoCarousel({
  images,
  variant = "inline",
  label = "Photos",
  className,
  onImageError,
  onIndexChange,
}: {
  images: PostImage[];
  variant?: "inline" | "fill";
  label?: string;
  className?: string;
  /** Called when an image fails to load (for example an expired signed URL) so the parent can fetch new ones. */
  onImageError?: () => void;
  onIndexChange?: (index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const count = images.length;

  const goTo = useCallback((next: number) => {
    const node = scroller.current;
    if (!node) return;
    const clamped = Math.max(0, Math.min(count - 1, next));
    node.scrollTo({ left: clamped * node.clientWidth, behavior: "smooth" });
  }, [count]);

  function onScroll() {
    const node = scroller.current;
    if (!node || node.clientWidth === 0) return;
    const next = Math.round(node.scrollLeft / node.clientWidth);
    if (next !== index && next >= 0 && next < count) {
      setIndex(next);
      onIndexChange?.(next);
    }
  }

  const current = images[Math.min(index, count - 1)];
  const ratio = current ? carouselRatio(current.width, current.height) : 1;

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(index - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(index + 1);
        }
      }}
      className={cn(
        "group/carousel relative overflow-hidden rounded-xl bg-card outline-offset-2",
        variant === "fill" ? "h-full w-full rounded-none bg-black" : "w-full",
        className,
      )}
      style={variant === "inline" ? { aspectRatio: String(ratio), maxHeight: "min(80dvh, 720px)" } : undefined}
    >
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        data-testid="carousel-track"
      >
        {images.map((image, position) => (
          <div
            key={image.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${count}`}
            className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center bg-black/5 dark:bg-white/5"
          >
            {failed[image.url] ? (
              <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-muted">
                <ImageOff aria-hidden="true" className="h-7 w-7" />
                This photo could not be loaded.
              </div>
            ) : (
              // Signed R2 URLs are per viewer and expire, so next/image optimisation does not apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.url}
                alt={`Photo ${position + 1} of ${count}`}
                width={image.width}
                height={image.height}
                loading={Math.abs(position - index) <= 1 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                onError={() => {
                  // Keyed by URL: refreshed (new) URLs for the same image get another chance.
                  setFailed((previous) => ({ ...previous, [image.url]: true }));
                  onImageError?.();
                }}
                className="h-full w-full select-none object-contain"
              />
            )}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <p
            className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium tabular-nums text-white"
            aria-live="polite"
            data-testid="carousel-counter"
          >
            {index + 1}/{count}
          </p>
          {index > 0 ? (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/carousel:opacity-100"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
          ) : null}
          {index < count - 1 ? (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/carousel:opacity-100"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5" aria-hidden="true">
            {images.map((image, position) => (
              <span
                key={image.id}
                className={cn("h-1.5 rounded-full bg-white/60 transition-all", position === index ? "w-4 bg-white" : "w-1.5")}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
