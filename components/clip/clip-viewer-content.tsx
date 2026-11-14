import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClipViewer } from "@/components/clip/clip-viewer";
import { ClipRow } from "@/components/feed/clip-tile";
import { CommentSection } from "@/components/social/comment-section";
import { Skeleton } from "@/components/ui/skeleton";
import { listMoments, loadClip, relatedClips } from "@/lib/clips";
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
  const clip = await loadClip(id);
  if (!clip) notFound();
  const shell = await getShellData();
  // These two functions are granted to signed-in users only, so signed-out visitors skip them.
  const signedIn = Boolean(shell.viewer);
  const [flags, relationship, moments] = await Promise.all([
    signedIn
      ? callSocial<Record<string, { liked?: boolean; bookmarked?: boolean; following?: boolean }>>("viewer_clip_flags", { ids: [id] })
      : Promise.resolve(null),
    signedIn && !clip.isOwn ? callSocial<{ blocked?: boolean }>("profile_relationship", { target: clip.userId }) : Promise.resolve(null),
    listMoments(id),
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
      blocked={Boolean(relationship?.ok && relationship.data?.blocked)}
      moments={moments}
      mode={mode}
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

export function ClipViewerSkeleton() {
  return (
    <div role="status" aria-label="Loading clip" className="fixed inset-0 z-50 flex flex-col bg-black landscape-short:flex-row lg:flex-row">
      <div className="h-[40dvh] shrink-0 bg-black landscape-short:h-auto landscape-short:flex-1 lg:h-auto lg:flex-1" />
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
