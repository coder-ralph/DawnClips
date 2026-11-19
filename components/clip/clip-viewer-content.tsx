import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClipViewer } from "@/components/clip/clip-viewer";
import { ClipRow } from "@/components/feed/clip-tile";
import { CommentSection } from "@/components/social/comment-section";
import { Skeleton } from "@/components/ui/skeleton";
import { listMoments, loadClip, loadClipPlayback, relatedClips } from "@/lib/clips";
import { getShellData } from "@/lib/shell-data";
import { callSocial } from "@/lib/social";

async function RelatedClips({ id }: { id: string }) {
  const related = await relatedClips(id);
  return (
    <section aria-labelledby="related-title" className="border-t">
      <h2 id="related-title" className="px-4 pb-1 pt-4 text-base font-bold">More clips</h2>
      {related.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">No related public clips yet.</p>
      ) : (
        <ul>
          {related.map((item) => (
            <li key={item.id}>
              <ClipRow replace clip={{ id: item.id, title: item.title, thumbnailUrl: item.thumbnailUrl, viewsCount: item.viewsCount, username: item.username, createdAt: item.createdAt }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Loads one clip and renders the media viewer. Shared by /clip/[id] and the intercepted modal route. */
export async function ClipViewerContent({ id, mode }: { id: string; mode: "modal" | "page" }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Independent lookups run together. The authorisation row, the viewer's profile and the signed video URLs are
  // memoised per request, so the page metadata and these calls share one database round trip.
  const [clip, shell, moments, playback] = await Promise.all([loadClip(id), getShellData(), listMoments(id), loadClipPlayback(id)]);
  if (!clip) notFound();
  // These two functions are granted to signed-in users only, so signed-out visitors skip them.
  const signedIn = Boolean(shell.viewer);
  const [flags, relationship] = await Promise.all([
    signedIn
      ? callSocial<Record<string, { liked?: boolean; bookmarked?: boolean; following?: boolean; muted?: boolean; restricted?: boolean }>>("viewer_clip_flags", { ids: [id] })
      : Promise.resolve(null),
    signedIn && !clip.isOwn ? callSocial<{ blocked?: boolean }>("profile_relationship", { target: clip.userId }) : Promise.resolve(null),
  ]);
  const viewer = shell.viewer
    ? { username: shell.viewer.username, displayName: shell.viewer.displayName, avatarUrl: shell.viewer.avatarUrl }
    : null;

  return (
    <ClipViewer
      // A new clip id remounts the viewer, so the previous video is stopped and its state is discarded.
      key={clip.id}
      clip={clip}
      liked={Boolean(flags?.ok && flags.data?.[id]?.liked)}
      saved={Boolean(flags?.ok && flags.data?.[id]?.bookmarked)}
      following={Boolean(flags?.ok && flags.data?.[id]?.following)}
      muted={Boolean(flags?.ok && flags.data?.[id]?.muted)}
      restricted={Boolean(flags?.ok && flags.data?.[id]?.restricted)}
      blocked={Boolean(relationship?.ok && relationship.data?.blocked)}
      moments={moments}
      mode={mode}
      playback={playback}
      comments={<CommentSection clipId={clip.id} initialCount={clip.commentsCount} viewer={viewer} />}
      related={
        clip.visibility === "public" ? (
          <Suspense fallback={<div className="border-t px-4 py-4"><Skeleton className="h-20 w-full" /></div>}>
            <RelatedClips id={id} />
          </Suspense>
        ) : null
      }
    />
  );
}

export { ClipViewerSkeleton } from "@/components/clip/clip-viewer-skeleton";
