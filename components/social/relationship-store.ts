"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { noRelationship, type Relationship } from "@/lib/relationships";

/**
 * What this browser has just changed about a relationship (follow, mute, restrict, block), shared by every component
 * that shows it: a clip menu, a Follow button, a profile menu and a settings list all read the same answer, so muting
 * from one clip is reflected on the next card by the same author without a reload. The server-rendered values are the
 * starting point; a change made here wins over them. Keyed by signed-in person, so signing out and in as someone else
 * in the same tab never shows the previous person's choices.
 */
const overrides = new Map<string, Partial<Relationship>>();
const listeners = new Set<() => void>();
const empty: Partial<Relationship> = {};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(key: string, patch: Partial<Relationship>) {
  overrides.set(key, { ...overrides.get(key), ...patch });
  for (const listener of listeners) listener();
}

const keyFor = (userId: string | null | undefined, profileId: string) => `${userId ?? "anon"}:${profileId}`;

/** The relationship with a profile, plus a function to record a change. `initial` is what the server rendered. */
export function useRelationship(profileId: string, initial?: Partial<Relationship>) {
  const { userId } = useAuth();
  const key = keyFor(userId, profileId);
  const override = useSyncExternalStore(
    subscribe,
    () => overrides.get(key) ?? empty,
    () => empty,
  );
  const patch = useCallback((change: Partial<Relationship>) => write(key, change), [key]);
  const relationship = useMemo<Relationship>(
    () => ({ ...noRelationship, ...initial, ...override }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is a fresh object each render; its fields are the inputs
    [initial?.following, initial?.followedBy, initial?.muted, initial?.restricted, initial?.blocked, override],
  );
  return [relationship, patch] as const;
}

/** For code that records a change about many different profiles (a list), without reading any one of them. */
export function useRelationshipPatcher() {
  const { userId } = useAuth();
  return useCallback((profileId: string, change: Partial<Relationship>) => write(keyFor(userId, profileId), change), [userId]);
}

/** What blocking does to the rest of the relationship (the database ends follows both ways and the blocker's mute / restrict). */
export const blockedState: Partial<Relationship> = { blocked: true, following: false, followedBy: false, muted: false, restricted: false };
