import { loadClip } from "@/lib/clips";
import { clipCardSize, renderClipCard } from "@/lib/og/clip-card";

export const alt = "A DawnClips gameplay highlight";
export const size = clipCardSize;
export const contentType = "image/png";

export default async function ClipOpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = await loadClip(id);
  // Only public clips get a card with their title and poster; anything else is the plain DawnClips image.
  return renderClipCard(
    clip && clip.visibility === "public"
      ? {
          title: clip.title,
          displayName: clip.displayName,
          username: clip.username,
          avatarUrl: clip.avatarUrl,
          thumbnailUrl: clip.thumbnailUrl,
          heroTags: clip.heroTags,
          duration: clip.duration,
          viewsCount: clip.viewsCount,
        }
      : null,
  );
}
