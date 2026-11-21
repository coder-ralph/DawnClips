"use client";

import { useCallback, useRef, useState } from "react";
import { PhotoCarousel } from "@/components/post/photo-carousel";
import type { PostImage } from "@/types/clips";

/**
 * The carousel of the post viewer. The signed image URLs expire; when one fails to load, new ones are fetched once
 * (through the same authorisation as the page) so a viewer that stays open for a long time keeps working.
 */
export function PostMedia({ postId, initial, title }: { postId: string; initial: PostImage[]; title: string }) {
  const [images, setImages] = useState(initial);
  const lastRefresh = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() - lastRefresh.current < 30_000) return;
    lastRefresh.current = Date.now();
    try {
      const response = await fetch(`/api/clips/${postId}/media`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { media?: PostImage[] };
      if (Array.isArray(body.media) && body.media.length > 0) setImages(body.media);
    } catch {
      // The broken-image message stays; a reload tries again.
    }
  }, [postId]);

  if (images.length === 0) {
    return <p className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">These photos are not available.</p>;
  }
  return <PhotoCarousel images={images} variant="fill" label={title ? `Photos: ${title}` : "Photos"} onImageError={() => void refresh()} />;
}
