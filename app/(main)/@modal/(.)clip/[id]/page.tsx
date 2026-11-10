import { Suspense } from "react";
import { ClipViewerContent, ClipViewerSkeleton } from "@/components/clip/clip-viewer-content";

async function Viewer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClipViewerContent id={id} mode="modal" />;
}

/** Opens a clip in the media viewer over the current page. A direct visit to /clip/[id] renders the full page instead. */
export default function InterceptedClip({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ClipViewerSkeleton />}>
      <Viewer params={params} />
    </Suspense>
  );
}
