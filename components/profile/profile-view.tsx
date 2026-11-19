import { FollowsYouBadge } from "@/components/profile/follows-you-badge";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ProfileGameInfo } from "@/components/profile/profile-game-info";
import { Avatar } from "@/components/ui/avatar";
import { countryName } from "@/lib/countries";
import { noRelationship, type Relationship } from "@/lib/relationships";
import { formatJoinDate } from "@/lib/utils";
import type { PublicProfile } from "@/types/database";

export function ProfileView({ profile, relationship = noRelationship }: { profile: PublicProfile; relationship?: Relationship }) {
  const country = countryName(profile.country);

  return (
    <header className="px-4 pb-4 pt-6 md:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold leading-tight">{profile.displayName}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted">
            @{profile.username}
            {profile.isOwn ? null : <FollowsYouBadge profileId={profile.id} initial={relationship.followedBy} />}
          </p>
        </div>
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={80} />
      </div>
      {profile.bio ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6">{profile.bio}</p>
      ) : profile.isOwn ? (
        <p className="mt-3 text-[15px] text-muted">Add a short bio from Edit profile.</p>
      ) : null}
      <p className="mt-2 text-sm text-muted">
        {country} · Joined {formatJoinDate(profile.createdAt)}
        {profile.roleId ? <> · Role ID: <span className="tabular-nums">{profile.roleId}</span></> : null}
      </p>
      <ProfileGameInfo highestRank={profile.highestRank} rankStars={profile.rankStars} favoriteRoles={profile.favoriteRoles} />
      {/* The key re-reads the counts after a refresh (for example once a follower was removed). */}
      <ProfileStats key={`${profile.followersCount}:${profile.followingCount}`} profile={profile} relationship={relationship} />
    </header>
  );
}
