"use client";

import Link from "next/link";
import { type ComponentProps, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { followersLabel, loadPreview, placeCard, rememberPreview, type ProfilePreview } from "@/lib/profile-preview";

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 200;

// Only one card is open at a time: opening another (moving from an avatar to the name beside it) closes the first.
let openCard: { id: string; close: () => void } | null = null;

type CardState = { status: "loading" } | { status: "ready"; profile: ProfilePreview } | { status: "error" };

/**
 * A link to a profile that, on mouse hover, shows a small preview card (name, username, bio, followers, Follow).
 * The link itself behaves exactly like a normal <Link>; touch screens never open the card, and keyboard users get the
 * link and the full profile page. The card stays open while the pointer is over it and closes on Escape.
 */
export function ProfileHoverLink({ username, onClick, ...props }: ComponentProps<typeof Link> & { username: string }) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CardState>({ status: "loading" });
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const cardId = useId();

  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
    setPosition(null);
    if (openCard?.id === cardId) openCard = null;
  }, [cardId, clearTimers]);

  const show = useCallback(() => {
    if (openCard && openCard.id !== cardId) openCard.close();
    openCard = { id: cardId, close };
    setOpen(true);
    setState({ status: "loading" });
    void loadPreview(username).then((profile) => setState(profile ? { status: "ready", profile } : { status: "error" }));
  }, [cardId, close, username]);

  function enter(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    window.clearTimeout(closeTimer.current);
    if (open) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(show, OPEN_DELAY_MS);
  }

  function leave(event: React.PointerEvent) {
    if (event.pointerType === "touch") return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }

  // Place the card once it is measured, and again when its content changes size (loading -> loaded).
  useLayoutEffect(() => {
    if (!open || !anchor.current || !card.current) return;
    const trigger = anchor.current.getBoundingClientRect();
    const size = card.current.getBoundingClientRect();
    const next = placeCard(trigger, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight });
    setPosition({ top: next.top, left: next.left });
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Close the card only; the viewer behind it must not close as well.
      event.preventDefault();
      close();
    };
    const onMove = () => close();
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      clearTimers();
      if (openCard?.id === cardId) openCard = null;
    },
    [cardId, clearTimers],
  );

  return (
    <>
      <Link
        {...props}
        ref={anchor}
        onClick={(event) => {
          close();
          onClick?.(event);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
      />
      {open
        ? createPortal(
            <div
              ref={card}
              id={cardId}
              role="group"
              aria-label="Profile preview"
              onPointerEnter={() => window.clearTimeout(closeTimer.current)}
              onPointerLeave={() => {
                window.clearTimeout(closeTimer.current);
                closeTimer.current = window.setTimeout(close, CLOSE_DELAY_MS);
              }}
              style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
              className={`fixed z-[60] w-80 max-w-[calc(100vw-1rem)] rounded-2xl border bg-background p-4 text-foreground shadow-[0_8px_30px_rgb(0_0_0/0.35)] transition-opacity duration-150 ${position ? "opacity-100" : "opacity-0"}`}
            >
              <PreviewBody
                state={state}
                onFollowChange={(profile, following, count) => {
                  const next = { ...profile, following, followersCount: profile.followersCount === null ? null : count };
                  rememberPreview(username, next);
                  setState({ status: "ready", profile: next });
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PreviewBody({
  state,
  onFollowChange,
}: {
  state: CardState;
  onFollowChange: (profile: ProfilePreview, following: boolean, followersCount: number) => void;
}) {
  if (state.status === "loading") {
    return (
      <div role="status" aria-label="Loading profile" className="animate-pulse">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 pt-1">
            <div className="h-5 w-32 rounded bg-card" />
            <div className="h-4 w-24 rounded bg-card" />
          </div>
          <div className="h-14 w-14 rounded-full bg-card" />
        </div>
        <div className="mt-4 h-4 w-48 rounded bg-card" />
        <div className="mt-4 h-8 w-full rounded-full bg-card" />
      </div>
    );
  }
  if (state.status === "error") {
    return <p role="status" className="text-sm text-muted">Could not load this profile.</p>;
  }

  const profile = state.profile;
  const followers = followersLabel(profile.followersCount);
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-6">{profile.displayName}</p>
          <p className="truncate text-sm text-foreground">@{profile.username}</p>
        </div>
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={56} />
      </div>
      {profile.bio ? <p className="mt-3 line-clamp-3 whitespace-pre-line break-words text-sm leading-5">{profile.bio}</p> : null}
      {followers ? <p className="mt-3 text-sm text-muted">{followers}</p> : null}
      {profile.isOwn ? null : (
        <div className="mt-4">
          <FollowButton
            key={profile.id}
            profileId={profile.id}
            following={profile.following}
            fullWidth
            onChange={(following, count) => onFollowChange(profile, following, count)}
          />
        </div>
      )}
    </>
  );
}
