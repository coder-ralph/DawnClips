import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VideoPlayer } from "@/components/video/video-player";
import { loadEmbedClip } from "@/lib/clips";

export const metadata: Metadata = { title: "Embedded clip", robots: { index: false, follow: false } };

async function Embed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = await loadEmbedClip(id);
  if (!clip) notFound();
  return (
    <div className="relative flex h-dvh w-full flex-col bg-black">
      <div className="flex min-h-0 flex-1 items-center">
        <VideoPlayer clipId={clip.id} title={clip.title} active autoplay={false} poster={clip.thumbnailUrl} />
      </div>
      <a
        href={`/clip/${clip.id}`}
        target="_blank"
        rel="noopener"
        className="flex h-9 shrink-0 items-center justify-between gap-3 bg-black px-3 text-xs text-white/80 hover:text-white"
      >
        <span className="truncate">{clip.title}</span>
        <span className="shrink-0 font-semibold">Watch on DawnClips ↗</span>
      </a>
    </div>
  );
}

export default function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-black" />}>
      <Embed params={params} />
    </Suspense>
  );
}
