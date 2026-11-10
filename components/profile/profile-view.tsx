import { ProfileStats } from "@/components/profile/profile-stats";
import { Avatar } from "@/components/ui/avatar";
import { countries } from "@/lib/validations/profile";
import { formatJoinDate } from "@/lib/utils";
import type { PublicProfile } from "@/types/database";

export function ProfileView({ profile, following = false }: { profile: PublicProfile; following?: boolean }) {
  const country = countries.find((item) => item.code === profile.country)?.label ?? profile.country;

  return (
    <header className="px-4 pb-4 pt-6 md:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold leading-tight">{profile.displayName}</h1>
          <p className="mt-0.5 text-[15px] text-muted">@{profile.username}</p>
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
        {profile.roleId ? <> · Role ID <span className="tabular-nums">{profile.roleId}</span></> : null}
      </p>
      <ProfileStats profile={profile} following={following} />
    </header>
  );
}
