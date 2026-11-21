"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { ProfileMenu } from "@/components/profile/profile-menu";
import { ShareProfile } from "@/components/profile/share-profile";
import { FollowButton } from "@/components/social/follow-button";
import { EditProfileLauncher } from "@/components/profile/edit-profile-launcher";
import { type Relationship } from "@/lib/relationships";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/video";
import type { PublicProfile } from "@/types/database";

function Stat({ href, label, value }: { href: string; label: string; value: number | null }) {
  if (value === null) {
    return <span className="text-muted">{label} private</span>;
  }
  return (
    <Link href={href} scroll={false} className="rounded text-muted hover:underline">
      <strong className="font-semibold tabular-nums text-foreground">{formatCount(value)}</strong> {label}
    </Link>
  );
}

export function ProfileStats({ profile, relationship }: { profile: PublicProfile; relationship: Relationship }) {
  const { isSignedIn } = useAuth();
  const [followers, setFollowers] = useState(profile.followersCount);
  const [followingCount, setFollowingCount] = useState(profile.followingCount);
  const showMenu = Boolean(isSignedIn) && !profile.isOwn;
  const base = `/profile/${profile.username}`;

  return (
    <>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Stat href={`${base}?tab=followers`} label={followers === 1 ? "follower" : "followers"} value={followers} />
        <Stat href={`${base}?tab=following`} label="following" value={followingCount} />
        <Stat href={base} label={profile.clipsCount === 1 ? "highlight" : "highlights"} value={profile.clipsCount} />
        <Stat href={`${base}?tab=posts`} label={profile.postsCount === 1 ? "post" : "posts"} value={profile.postsCount} />
      </p>
      <div className={cn("mt-4 grid gap-2", showMenu ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-2")}>
        {profile.isOwn ? (
          <EditProfileLauncher />
        ) : (
          <FollowButton profileId={profile.id} following={relationship.following} fullWidth onChange={(_next, count) => setFollowers(count)} />
        )}
        <ShareProfile username={profile.username} />
        {showMenu ? (
          <ProfileMenu
            profile={profile}
            initial={relationship}
            // They no longer follow you, so their "following" count is one lower.
            onFollowerRemoved={() => setFollowingCount((count) => (count === null ? null : Math.max(0, count - 1)))}
          />
        ) : null}
      </div>
    </>
  );
}
