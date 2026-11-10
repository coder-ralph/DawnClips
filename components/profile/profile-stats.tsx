"use client";

import Link from "next/link";
import { useState } from "react";
import { ShareProfile } from "@/components/profile/share-profile";
import { FollowButton } from "@/components/social/follow-button";
import { EditProfileLauncher } from "@/components/profile/edit-profile-launcher";
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

export function ProfileStats({ profile, following }: { profile: PublicProfile; following: boolean }) {
  const [followers, setFollowers] = useState(profile.followersCount);
  const base = `/profile/${profile.username}`;

  return (
    <>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Stat href={`${base}?tab=followers`} label={followers === 1 ? "follower" : "followers"} value={followers} />
        <Stat href={`${base}?tab=following`} label="following" value={profile.followingCount} />
        <Stat href={base} label={profile.clipsCount === 1 ? "highlight" : "highlights"} value={profile.clipsCount} />
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {profile.isOwn ? (
          <EditProfileLauncher />
        ) : (
          <FollowButton profileId={profile.id} following={following} fullWidth onChange={(_next, count) => setFollowers(count)} />
        )}
        <ShareProfile username={profile.username} />
      </div>
    </>
  );
}
