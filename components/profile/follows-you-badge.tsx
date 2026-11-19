"use client";

import { useRelationship } from "@/components/social/relationship-store";

/** "Follows you" next to the username. Reads the shared relationship, so it disappears when you remove the follower. */
export function FollowsYouBadge({ profileId, initial }: { profileId: string; initial: boolean }) {
  const [relationship] = useRelationship(profileId, { followedBy: initial });
  if (!relationship.followedBy) return null;
  return <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted">Follows you</span>;
}
