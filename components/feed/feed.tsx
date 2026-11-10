"use client";

import { useAuth } from "@clerk/nextjs";
import { Film, ListFilter, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipCard } from "@/components/feed/clip-card";
import { FeedSkeleton } from "@/components/feed/clip-skeleton";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/action-menu";
import { PageHeader } from "@/components/ui/page-container";
import { OpenUploadButton } from "@/components/upload/open-upload-button";
import { CLIP_PUBLISHED_EVENT } from "@/lib/ui-events";
import type { FeedClip, FeedName } from "@/types/clips";

const feeds: Array<{ id: FeedName; label: string }> = [
  { id: "foryou", label: "For you" },
  { id: "trending", label: "Trending" },
  { id: "latest", label: "Latest" },
  { id: "following", label: "Following" },
];

export function Feed({
  initialFeed,
  initialClips,
  initialCursor,
  composer,
}: {
  initialFeed: FeedName;
  initialClips: FeedClip[];
  initialCursor: string | null;
  /** Server-rendered "what's new" row shown under the header. */
  composer?: React.ReactNode;
}) {
  const { isSignedIn } = useAuth();
  const [feed, setFeed] = useState(initialFeed);
  const [clips, setClips] = useState(initialClips);
  const [cursor, setCursor] = useState(initialCursor);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextFeed: FeedName, nextCursor: string | null, replace: boolean) => {
    if (!replace && loadingRef.current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ feed: nextFeed });
    if (nextCursor) params.set("cursor", nextCursor);
    try {
      const response = await fetch(`/api/clips?${params}`, { signal: controller.signal });
      if (!response.ok) {
        setError("Could not load clips.");
        return;
      }
      const body = (await response.json()) as { clips: FeedClip[]; nextCursor: string | null };
      if (controller.signal.aborted) return;
      setClips((current) => (replace ? body.clips : [...current, ...body.clips]));
      setCursor(body.nextCursor);
      if (replace) setActiveId(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Could not load clips. Check your connection.");
    } finally {
      if (abortRef.current === controller) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  function select(next: FeedName) {
    if (next === feed) return;
    abortRef.current?.abort();
    loadingRef.current = false;
    setFeed(next);
    setClips([]);
    setCursor(null);
    setActiveId(null);
    setError("");
    if (next === "following" && isSignedIn === false) {
      setLoading(false);
      return;
    }
    void load(next, null, true);
  }

  const feedRef = useRef(feed);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  // A new clip was just posted: refetch the current feed so it shows up without a page reload.
  useEffect(() => {
    const onPublished = () => {
      if (feedRef.current === "following" && isSignedIn === false) return;
      void load(feedRef.current, null, true);
    };
    window.addEventListener(CLIP_PUBLISHED_EVENT, onPublished);
    return () => window.removeEventListener(CLIP_PUBLISHED_EVENT, onPublished);
  }, [load, isSignedIn]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loadingRef.current) void load(feed, cursor, false);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, feed, error, load]);

  const hideClip = useCallback((id: string) => setActiveId((current) => (current === id ? null : current)), []);
  const removeClip = useCallback((id: string) => setClips((current) => current.filter((clip) => clip.id !== id)), []);
  const followingLocked = feed === "following" && isSignedIn === false;

  return (
    <section aria-label="Clips">
      <PageHeader
        title={feeds.find((item) => item.id === feed)?.label ?? "For you"}
        actions={
          <ActionMenu
            label="Choose feed"
            items={feeds.map((item) => ({
              label: item.label,
              checked: item.id === feed,
              onSelect: () => select(item.id),
            }))}
            buttonClassName="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong hover:bg-hover"
          >
            <ListFilter aria-hidden="true" className="h-5 w-5" />
          </ActionMenu>
        }
      />
      {composer}
      <div aria-busy={loading}>
        {followingLocked ? (
          <EmptyState
            icon={UserPlus}
            title="Log in to see who you follow"
            body="The Following feed shows new clips from the players you follow."
            action={<Link href="/sign-in" className={buttonClasses()}>Log in</Link>}
          />
        ) : null}

        {!followingLocked && clips.length === 0 && !loading && !error ? (
          feed === "following" ? (
            <EmptyState
              icon={UserPlus}
              title="Nothing here yet"
              body="Follow players to see their latest clips in this feed."
              action={<Link href="/explore" className={buttonClasses({ variant: "secondary" })}>Find players</Link>}
            />
          ) : (
            <EmptyState
              icon={Film}
              title="No clips yet"
              body="Be the first to share an MLBB highlight."
              action={<OpenUploadButton className={buttonClasses()}>Upload a clip</OpenUploadButton>}
            />
          )
        ) : null}

        {clips.map((clip) => (
          <ClipCard key={clip.id} clip={clip} active={activeId === clip.id} onVisible={setActiveId} onHidden={hideClip} onRemoved={removeClip} />
        ))}

        {loading ? <FeedSkeleton count={clips.length === 0 ? 2 : 1} /> : null}

        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void load(feed, clips.length === 0 ? null : cursor, clips.length === 0)}>
              Try again
            </Button>
          </div>
        ) : null}

        <div ref={sentinel} className="h-px" />
        {!cursor && clips.length > 0 && !loading && !error ? (
          <p className="py-8 text-center text-sm text-muted">You are all caught up.</p>
        ) : null}
      </div>
    </section>
  );
}
