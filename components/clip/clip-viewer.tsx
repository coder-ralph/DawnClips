"use client";

import { ChevronLeft, ChevronRight, Lock, MessageCircle, Pin, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipPatch } from "@/components/clip/edit-clip-dialog";
import { MomentsPanel } from "@/components/clip/moments-panel";
import { HeroChips } from "@/components/feed/clip-card";
import { ClipMenu } from "@/components/feed/clip-menu";
import { BookmarkButton } from "@/components/social/bookmark-button";
import { FollowButton } from "@/components/social/follow-button";
import { LikeButton } from "@/components/social/like-button";
import { Avatar } from "@/components/ui/avatar";
import { ShareButton } from "@/components/ui/share-button";
import { VideoPlayer, pauseAllPlayers, type PlayerController } from "@/components/video/video-player";
import { cn } from "@/lib/utils";
import { formatCount, formatRelativeTime } from "@/lib/video";
import type { ClipDetail, ClipMoment } from "@/types/clips";

const roundButton =
  "flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 focus-visible:outline-white";

/**
 * Threads-style media viewer. Left: the video with a close button and an arrow that hides the side
 * panel. Right: creator, text, moments, actions and comments. Below `lg` the panel sits under the video.
 * `mode="modal"` is the intercepted route over the previous page; `mode="page"` is a direct visit.
 */
export function ClipViewer({
  clip,
  liked,
  saved: initialSaved,
  following,
  blocked,
  moments,
  mode,
  comments,
  related,
}: {
  clip: ClipDetail;
  liked: boolean;
  saved: boolean;
  following: boolean;
  blocked: boolean;
  moments: ClipMoment[];
  mode: "modal" | "page";
  comments: React.ReactNode;
  related?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStartAt = Number(searchParams.get("t"));
  const startAt =
    Number.isFinite(requestedStartAt) && requestedStartAt > 0
      ? requestedStartAt
      : 0;

  const controller = useRef<PlayerController>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [text, setText] = useState({ title: clip.title, description: clip.description, heroTags: clip.heroTags, editedAt: clip.editedAt ?? null });
  const [saved, setSaved] = useState(initialSaved);
  const [pinned, setPinned] = useState(Boolean(clip.pinnedAt));
  const applyEdit = (patch: ClipPatch) => setText(patch);

  const close = useCallback(() => {
    // Stop the video right away: the route change can take a moment, and the player is only
    // unmounted once it completes.
    controller.current?.stop();
    if (mode === "modal") router.back();
    else router.push("/");
  }, [mode, router]);

  // Anything still playing on the page behind the viewer (a feed card) is paused while it is open.
  useEffect(() => {
    pauseAllPlayers();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Let an open menu or dialog handle Escape first.
      if (document.querySelector('[role="menu"], dialog[open]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  useEffect(() => {
    if (window.location.hash === "#comments") {
      const timer = window.setTimeout(() => document.getElementById("comments")?.scrollIntoView(), 50);
      return () => window.clearTimeout(timer);
    }
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${text.title} by ${clip.displayName}`} className="fixed inset-0 z-50 flex flex-col bg-black landscape-short:flex-row lg:flex-row">
      <div className="relative h-[40dvh] min-h-0 shrink-0 bg-black landscape-short:h-auto landscape-short:min-w-0 landscape-short:flex-1 lg:h-auto lg:flex-1">
        <button ref={closeRef} type="button" onClick={close} aria-label="Close" className={cn(roundButton, "absolute left-3 top-3 z-10")}>
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-label={panelOpen ? "Hide details and comments" : "Show details and comments"}
          aria-expanded={panelOpen}
          className={cn(roundButton, "absolute right-3 top-3 z-10 hidden landscape-short:flex lg:flex")}
        >
          {panelOpen ? <ChevronRight aria-hidden="true" className="h-5 w-5" /> : <ChevronLeft aria-hidden="true" className="h-5 w-5" />}
        </button>
        <VideoPlayer
          clipId={clip.id}
          title={text.title}
          active
          autoplay={clip.visibility === "public" || clip.isOwn}
          poster={clip.thumbnailUrl}
          controllerRef={controller}
          variant="viewer"
          startAt={startAt}
        />
      </div>

      <aside
        // Following any link in the panel (More clips, a profile) stops the video immediately, before the next page arrives.
        onClickCapture={(event) => {
          if (!(event.target instanceof Element)) return;
          const link = event.target.closest("a[href]");
          const href = link?.getAttribute("href") ?? "";
          if (link && href && !href.startsWith("#") && link.getAttribute("target") !== "_blank") controller.current?.stop();
        }}
        aria-label="Details and comments"
        className={cn(
          "min-h-0 flex-1 overflow-y-auto bg-background text-foreground landscape-short:w-[min(380px,42vw)] landscape-short:flex-none landscape-short:border-l lg:w-[420px] lg:flex-none lg:border-l",
          !panelOpen && "landscape-short:hidden lg:hidden",
        )}
      >
        <div className="px-4 pt-4">
          <header className="flex items-center gap-3">
            <Link href={`/profile/${clip.username}`} aria-label={`${clip.displayName}'s profile`} className="rounded-full">
              <Avatar src={clip.avatarUrl} name={clip.displayName} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/profile/${clip.username}`} className="block truncate font-semibold hover:underline">{clip.displayName}</Link>
              <p className="truncate text-sm text-muted">
                @{clip.username} · <time dateTime={clip.createdAt} suppressHydrationWarning>{formatRelativeTime(clip.createdAt)}</time>
                {text.editedAt ? " · Edited" : ""}
              </p>
            </div>
            {clip.isOwn ? null : <FollowButton profileId={clip.userId} following={following} size="sm" />}
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
              isOwn={clip.isOwn}
              commentsMode={clip.commentsMode}
              blocked={blocked}
              saved={saved}
              pinned={pinned}
              onSavedChange={setSaved}
              onPinnedChange={setPinned}
              onEdited={applyEdit}
              onDeleted={close}
            />
          </header>

          {pinned ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Pin aria-hidden="true" className="h-3 w-3" /> Pinned to the profile
            </p>
          ) : null}
          <h1 className="mt-3 text-[17px] font-bold leading-6">{text.title}</h1>
          {clip.visibility !== "public" ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium capitalize text-muted">
              <Lock aria-hidden="true" className="h-3 w-3" />
              {clip.visibility === "unlisted" ? "Unlisted · only people with the link" : "Private · only you"}
            </p>
          ) : null}
          {text.description ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-6">{text.description}</p> : null}
          <HeroChips tags={text.heroTags} />

          <MomentsPanel clipId={clip.id} initial={moments} isOwn={clip.isOwn} controller={controller} />

          <div className="mt-3 flex items-center border-b pb-2">
            <div className="-ml-2.5 flex items-center">
              <LikeButton
                clipId={clip.id}
                liked={liked}
                count={clip.likesCount}
              />
              <button type="button" onClick={() => document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" })} className="action-btn">
                <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" />
                <span className="sr-only">Comments</span>
                <span>{formatCount(clip.commentsCount)}</span>
              </button>
              <ShareButton path={`/clip/${clip.id}`} compact />
            </div>
            <span className="ml-auto text-xs tabular-nums text-muted">{formatCount(clip.viewsCount)} views</span>
            <BookmarkButton clipId={clip.id} saved={saved} onSavedChange={setSaved} className="-mr-2.5 ml-1" />
          </div>
        </div>

        {comments}
        {related}
      </aside>
    </div>
  );
}
