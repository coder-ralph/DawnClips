"use client";

import { useState } from "react";
import { useRelationship } from "@/components/social/relationship-store";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";

/**
 * Follow / Following toggle. The state is shared through the relationship store, so a clip menu's "Unfollow" and this
 * button stay in step. Changes show at once and are rolled back with a message if the request fails. Clicking
 * "Following" unfollows straight away.
 */
export function FollowButton({
  profileId,
  following,
  onChange,
  size = "md",
  fullWidth,
  followLabel = "Follow",
  name,
}: {
  profileId: string;
  following: boolean;
  onChange?: (following: boolean, followersCount: number) => void;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Text while not following, e.g. "Follow back" in someone's own followers list. */
  followLabel?: string;
  /** Who it is for, so a list of identical buttons is distinguishable to a screen reader ("Follow back Ana"). */
  name?: string;
}) {
  const toast = useToast();
  const [relationship, patch] = useRelationship(profileId, { following });
  const state = relationship.following;
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !state;
    patch({ following: next });
    setPending(true);
    try {
      const response = await fetch(`/api/profiles/${profileId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        patch({ following: !next });
        toast(await apiErrorMessage(response, "Could not update the follow."), "error");
        return;
      }
      const body = (await response.json().catch(() => null)) as { following?: boolean; followersCount?: number } | null;
      if (!body) {
        patch({ following: !next });
        toast("Could not update the follow.", "error");
        return;
      }
      patch({ following: Boolean(body.following) });
      onChange?.(Boolean(body.following), body.followersCount ?? 0);
    } catch {
      patch({ following: !next });
      toast("Could not update the follow. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={state ? "secondary" : "primary"}
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      aria-pressed={state}
      aria-label={name ? `${state ? "Following" : followLabel} ${name}` : undefined}
      onClick={() => void toggle()}
    >
      {state ? "Following" : followLabel}
    </Button>
  );
}
