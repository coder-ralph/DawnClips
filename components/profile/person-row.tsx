import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { PersonRow } from "@/lib/relationships";

/**
 * One person in a list: avatar, display name and @username link to the profile, with an optional action (Follow back,
 * Unmute, ...) beside it. The action sits outside the link so there is never a button inside a link.
 */
export function PersonListItem({ person, action }: { person: PersonRow; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 md:px-5">
      <Link href={`/profile/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
        <Avatar src={person.avatarUrl} name={person.displayName} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{person.displayName}</span>
          <span className="block truncate text-sm text-muted">@{person.username}</span>
        </span>
      </Link>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
