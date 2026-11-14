"use client";

import { MessageCircle, Pin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MomentChips } from "@/components/clip/moment-chips";
import type { ClipPatch } from "@/components/clip/edit-clip-dialog";
import { ClipMenu } from "@/components/feed/clip-menu";
import { BookmarkButton } from "@/components/social/bookmark-button";
import { LikeButton } from "@/components/social/like-button";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/ui/share-button";
import { VideoPlayer, type PlayerController } from "@/components/video/video-player";
import { tagLabel } from "@/lib/heroes";
import { formatCount, formatRelativeTime } from "@/lib/video";
import type { FeedClip } from "@/types/clips";

export function HeroChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Heroes">
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            href={`/explore?q=${encodeURIComponent(tagLabel(tag))}`}
            className="inline-flex h-6 items-center rounded-full bg-card px-2.5 text-xs font-medium text-muted transition-colors hover:bg-active hover:text-foreground"
          >
            {tagLabel(tag)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * One clip in a list (Home, Saved, Explore, profile tabs). Plays inline: it
 * autoplays muted while it is the clip most in view and pauses when it
 * scrolls away. Edits, pinning and saving update the card in place.
 */
export function ClipCard({
  clip,
  active,
  onVisible,
  onHidden,
  onRemoved,
  onSavedChange,
}: {
  clip: FeedClip;
  active: boolean;
  onVisible: (id: string) => void;
  onHidden?: (id: string) => void;
  onRemoved?: (id: string) => void;
  /** Called after the viewer saves or unsaves this clip from the menu or the bookmark button. */
  onSavedChange?: (id: string, saved: boolean) => void;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const controller = useRef<PlayerController>(null);
  const router = useRouter();
  const [text, setText] = useState({
    title: clip.title,
    description: clip.description,
    heroTags: clip.heroTags,
    editedAt: clip.editedAt ?? null,
  });
  const [pinned, setPinned] = useState(Boolean(clip.pinnedAt));
  const [saved, setSaved] = useState(Boolean(clip.bookmarked));

  useEffect(() => {
    const node = playerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onVisible(clip.id);
          else if (!entry.isIntersecting || entry.intersectionRatio < 0.25) onHidden?.(clip.id);
        }
      },
      { threshold: [0, 0.25, 0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [clip.id, onVisible, onHidden]);

  const changeSaved = useCallback(
    (next: boolean) => {
      setSaved(next);
      onSavedChange?.(clip.id, next);
    },
    [clip.id, onSavedChange],
  );

  const openViewer = useCallback(
    (currentTime: number) => {
      const timestamp = Number.isFinite(currentTime)
        ? Math.max(0, currentTime)
        : 0;

      router.push(`/clip/${clip.id}?t=${encodeURIComponent(String(timestamp))}`);
    },
    [clip.id, router],
  );

  const profileHref = `/profile/${clip.username}`;
  const applyEdit = (patch: ClipPatch) => setText(patch);

  return (
    <article aria-labelledby={`clip-${clip.id}-title`} className="border-b px-4 py-4 md:px-5">
      {pinned ? (
        <p className="mb-1.5 ml-[52px] flex items-center gap-1.5 text-xs font-medium text-muted">
          <Pin aria-hidden="true" className="h-3 w-3" /> Pinned
        </p>
      ) : null}
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
        <Link href={profileHref} aria-label={`${clip.displayName}'s profile`} className="h-10 w-10 rounded-full">
          <Avatar src={clip.avatarUrl} name={clip.displayName} size={40} />
        </Link>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] leading-5">
              <Link href={profileHref} className="font-semibold hover:underline">{clip.displayName}</Link>
              <span className="text-muted">
                {" "}@{clip.username} · <time dateTime={clip.createdAt} suppressHydrationWarning>{formatRelativeTime(clip.createdAt)}</time>
                {text.editedAt ? " · Edited" : ""}
              </span>
            </p>
            <ClipMenu
              clip={{
                id: clip.id,
                userId: clip.userId,
                username: clip.username,
                title: text.title,
                description: text.description,
                heroTags: text.heroTags,
                visibility: clip.visibility,
                editableUntil: clip.editableUntil,
              }}
              isOwn={Boolean(clip.isOwn)}
              commentsMode={clip.commentsMode}
              saved={saved}
              pinned={pinned}
              onSavedChange={changeSaved}
              onPinnedChange={setPinned}
              onEdited={applyEdit}
              onDeleted={onRemoved ? () => onRemoved(clip.id) : undefined}
            />
          </div>
          <h2 id={`clip-${clip.id}-title`} className="mt-0.5 text-[15px] font-medium leading-6">
            <Link href={`/clip/${clip.id}`} className="hover:underline">{text.title}</Link>
          </h2>
          {text.description ? <p className="line-clamp-2 whitespace-pre-line text-sm leading-6 text-muted">{text.description}</p> : null}
          <HeroChips tags={text.heroTags} />
          <MomentChips moments={clip.moments} controller={controller} onJump={() => onVisible(clip.id)} />
        </div>

        <div ref={playerRef} className="col-span-2 mt-3 sm:col-span-1 sm:col-start-2">
          <VideoPlayer
            clipId={clip.id}
            title={text.title}
            active={active}
            autoplay
            poster={clip.thumbnailUrl}
            controllerRef={controller}
            onPlay={() => onVisible(clip.id)}
            onOpen={openViewer}
          />
        </div>

        <div className="col-span-2 mt-1.5 flex items-center sm:col-span-1 sm:col-start-2">
          <div className="-ml-2.5 flex items-center">
            <LikeButton
              clipId={clip.id}
              liked={Boolean(clip.liked)}
              count={clip.likesCount}
            />
            <Link href={`/clip/${clip.id}#comments`} className="action-btn">
              <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" />
              <span className="sr-only">Comments</span>
              <span>{formatCount(clip.commentsCount)}</span>
            </Link>
            <ShareButton path={`/clip/${clip.id}`} compact />
          </div>
          <span className="ml-auto text-xs tabular-nums text-muted">{formatCount(clip.viewsCount)} views</span>
          <BookmarkButton clipId={clip.id} saved={saved} onSavedChange={changeSaved} className="-mr-2.5 ml-1" />
        </div>
      </div>
    </article>
  );
}
