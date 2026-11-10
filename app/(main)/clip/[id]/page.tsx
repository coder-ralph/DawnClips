import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipViewerContent, ClipViewerSkeleton } from "@/components/clip/clip-viewer-content";
import { siteConfig } from "@/config/site";
import { loadClip } from "@/lib/clips";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const clip = await loadClip(id);
  if (!clip || clip.visibility !== "public") {
    return { title: "Clip", robots: { index: false, follow: false } };
  }
  return {
    title: clip.title,
    description: clip.description || `${clip.displayName} on DawnClips`,
    alternates: { canonical: `${siteConfig.url}/clip/${clip.id}` },
    openGraph: {
      title: clip.title,
      description: clip.description || siteConfig.tagline,
      url: `${siteConfig.url}/clip/${clip.id}`,
      type: "video.other",
    },
  };
}

async function Viewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClipViewerContent id={id} mode="page" />;
}

export default function ClipPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ClipViewerSkeleton />}>
      <Viewer params={params} />
    </Suspense>
  );
}
