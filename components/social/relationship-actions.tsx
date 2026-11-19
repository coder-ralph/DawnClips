"use client";

import { ShieldAlert, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { blockedState, useRelationship } from "@/components/social/relationship-store";
import type { MenuItem } from "@/components/ui/action-menu";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import type { Relationship } from "@/lib/relationships";

export type RelationshipActions = ReturnType<typeof useRelationshipActions>;

/**
 * Everything the clip menu and the profile menu can do to another profile: mute, restrict, unfollow, remove follower
 * and block. The relationship is shared through the store, so every menu and button for that person agrees. Changes
 * show at once and are rolled back with an error message if the server refuses; the server (not this code) decides
 * what is allowed. Counts on the page are re-read after anything that changes a follow.
 */
export function useRelationshipActions(profile: { id: string; username: string }, initial?: Partial<Relationship>) {
  const toast = useToast();
  const router = useRouter();
  const [relationship, patch] = useRelationship(profile.id, initial);
  const [blocking, setBlocking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const handle = `@${profile.username}`;

  /** POSTs to /api/profiles/[id]/<path>; null (after an error message) when it did not work. */
  async function send(path: string, body: unknown, failure: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`/api/profiles/${profile.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) {
        toast(await apiErrorMessage(response, failure), "error");
        return null;
      }
      return ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } catch {
      toast(`${failure} Check your connection.`, "error");
      return null;
    }
  }

  async function setMuted(next: boolean) {
    patch({ muted: next });
    const result = await send("mute", { desired: next }, "Could not update the mute.");
    if (!result) return patch({ muted: !next });
    toast(next ? `Muted ${handle}. Their clips won't show in your feeds.` : `Unmuted ${handle}`);
  }

  async function setRestricted(next: boolean) {
    patch({ restricted: next });
    const result = await send("restrict", { desired: next }, "Could not update the restriction.");
    if (!result) return patch({ restricted: !next });
    toast(next ? `Restricted ${handle}. Their comments are hidden from others.` : `Unrestricted ${handle}`);
  }

  async function unfollow() {
    patch({ following: false });
    const result = await send("follow", { desired: false }, "Could not update the follow.");
    if (!result) return patch({ following: true });
    toast(`Unfollowed ${handle}`);
    router.refresh();
  }

  /** True when they are no longer a follower (also when they already were not). */
  async function removeFollower(): Promise<boolean> {
    setRemoving(true);
    patch({ followedBy: false });
    const result = await send("remove-follower", {}, "Could not remove the follower.");
    setRemoving(false);
    if (!result) {
      patch({ followedBy: true });
      return false;
    }
    toast(`Removed ${handle} from your followers`);
    router.refresh();
    return true;
  }

  /** True when the block was changed. Not optimistic: the confirmation dialog shows a spinner until the server answers. */
  async function setBlocked(next: boolean): Promise<boolean> {
    setBlocking(true);
    const result = await send("block", { desired: next }, "Could not update the block.");
    setBlocking(false);
    if (!result) return false;
    patch(next ? blockedState : { blocked: false });
    toast(next ? `Blocked ${handle}` : `Unblocked ${handle}`);
    router.refresh();
    return true;
  }

  return { relationship, patch, blocking, removing, setMuted, setRestricted, unfollow, removeFollower, setBlocked };
}

/** Mute / Unmute and Restrict / Unrestrict, with the current state shown on the right ("Muted", "Restricted"). */
export function muteRestrictItems(
  username: string,
  relationship: Relationship,
  actions: Pick<RelationshipActions, "setMuted" | "setRestricted">,
  separatorBefore = false,
): MenuItem[] {
  return [
    {
      label: relationship.muted ? `Unmute @${username}` : `Mute @${username}`,
      icon: relationship.muted ? Volume2 : VolumeX,
      meta: relationship.muted ? "Muted" : undefined,
      separatorBefore,
      onSelect: () => void actions.setMuted(!relationship.muted),
    },
    {
      label: relationship.restricted ? `Unrestrict @${username}` : `Restrict @${username}`,
      icon: relationship.restricted ? ShieldCheck : ShieldAlert,
      meta: relationship.restricted ? "Restricted" : undefined,
      onSelect: () => void actions.setRestricted(!relationship.restricted),
    },
  ];
}
