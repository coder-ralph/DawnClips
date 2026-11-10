import Link from "next/link";
import { EditProfileLauncher } from "@/components/profile/edit-profile-launcher";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import type { OwnProfile } from "@/types/database";

/** Read-only summary of what other players see. Editing happens in the Edit profile modal. */
export function PublicProfileSection({ profile }: { profile: OwnProfile }) {
  return (
    <section id="profile" aria-labelledby="public-profile-title" className="scroll-mt-28 border-t px-4 py-6 md:px-5">
      <h2 id="public-profile-title" className="text-base font-bold">Public profile</h2>
      <div className="mt-4 flex items-start gap-4">
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-6">{profile.displayName}</p>
          <p className="truncate text-sm text-muted">@{profile.username}</p>
          {profile.bio ? <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6">{profile.bio}</p> : <p className="mt-2 text-sm text-muted">No bio yet.</p>}
          <p className="mt-2 text-sm text-muted">
            Role ID: {profile.roleId ? <span className="tabular-nums text-foreground">{profile.roleId}</span> : "not set"} · Zone ID: {profile.zoneId ? "set (private)" : "not set"}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <EditProfileLauncher
          initial={{
            displayName: profile.displayName,
            username: profile.username,
            bio: profile.bio,
            roleId: profile.roleId,
            zoneId: profile.zoneId,
            country: profile.country,
            avatarUrl: profile.avatarUrl,
          }}
        />
        <Link href={`/profile/${profile.username}`} className={buttonClasses({ variant: "secondary", fullWidth: true })}>View profile</Link>
      </div>
    </section>
  );
}
