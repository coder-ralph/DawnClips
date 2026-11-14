import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipViewerContent, ClipViewerSkeleton } from "@/components/clip/clip-viewer-content";
import { siteConfig } from "@/config/site";
import { loadClip } from "@/lib/clips";
import { tagLabel } from "@/lib/heroes";

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const clip = await loadClip(id);
  if (!clip || clip.visibility !== "public") {
    return { title: "Clip", robots: { index: false, follow: false } };
  }
  const url = `${siteConfig.url}/clip/${clip.id}`;
  const heroes = clip.heroTags.slice(0, 3).map(tagLabel);
  // Hashtags read as noise in a preview, so they are dropped from the description.
  const summary = clip.description.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/g, " ").trim();
  // What Facebook, Messenger, X and Discord show under the title: the caption, or a line built from the clip's facts.
  const description = summary
    ? shorten(summary, 200)
    : `Watch ${clip.displayName}'s MLBB highlight${heroes.length ? ` featuring ${heroes.join(", ")}` : ""} on DawnClips.`;
  const title = shorten(clip.title, 90);
  return {
    title: clip.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "video.other",
      siteName: siteConfig.name,
      title,
      description,
      url,
      locale: "en_US",
    },
    twitter: { card: "summary_large_image", title, description },
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
