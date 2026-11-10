import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

export function UserRow({
  username,
  displayName,
  avatarUrl,
  bio,
}: {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
}) {
  return (
    <Link href={`/profile/${username}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover md:px-5">
      <Avatar src={avatarUrl} name={displayName} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{displayName}</span>
        <span className="block truncate text-sm text-muted">@{username}</span>
        {bio ? <span className="mt-0.5 line-clamp-1 block text-sm text-muted">{bio}</span> : null}
      </span>
    </Link>
  );
}
