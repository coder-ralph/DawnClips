import { Eye, Images, Lock } from "lucide-react";
import Link from "next/link";
import { ClipThumb } from "@/components/feed/clip-thumb";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, formatRelativeTime } from "@/lib/video";

export type ClipSummary = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  viewsCount?: number;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  visibility?: string;
  /** "photo" for a photo post; anything else is a video. */
  kind?: string;
  mediaCount?: number;
};

const clipTitle = (clip: ClipSummary) => clip.title || (clip.kind === "photo" ? "Photo post" : "");

/** Marks a photo post in a grid or list: it opens a carousel, not a video. */
function PhotoBadge({ clip }: { clip: ClipSummary }) {
  if (clip.kind !== "photo") return null;
  return (
    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
      <Images aria-hidden="true" className="h-3 w-3" />
      {(clip.mediaCount ?? 0) > 1 ? clip.mediaCount : <span className="sr-only">Photo post</span>}
      {(clip.mediaCount ?? 0) > 1 ? <span className="sr-only"> photos</span> : null}
    </span>
  );
}

function VisibilityBadge({ visibility }: { visibility?: string }) {
  if (!visibility || visibility === "public") return null;
  return (
    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium capitalize text-white">
      <Lock aria-hidden="true" className="h-3 w-3" />
      {visibility}
    </span>
  );
}

/** Grid cell: poster first, text underneath. Used on profile, explore and saved. */
export function ClipTile({ clip }: { clip: ClipSummary }) {
  return (
    <Link href={`/clip/${clip.id}`} className="group block rounded-xl">
      <div className="relative overflow-hidden rounded-xl">
        <ClipThumb src={clip.thumbnailUrl} clipId={clip.id} photo={clip.kind === "photo"} className="transition-transform duration-200 group-hover:scale-[1.03]" />
        <VisibilityBadge visibility={clip.visibility} />
        <PhotoBadge clip={clip} />
        {typeof clip.viewsCount === "number" && clip.kind !== "photo" ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
            <Eye aria-hidden="true" className="h-3 w-3" />
            {formatCount(clip.viewsCount)}
            <span className="sr-only"> views</span>
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5">{clipTitle(clip)}</p>
      {clip.username || clip.createdAt ? (
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
          {clip.username ? <Avatar src={clip.avatarUrl} name={clip.displayName ?? clip.username} size={16} /> : null}
          <span className="truncate">
            {clip.username ? `@${clip.username}` : null}
            {clip.username && clip.createdAt ? " · " : null}
            {clip.createdAt ? <time dateTime={clip.createdAt} suppressHydrationWarning>{formatRelativeTime(clip.createdAt)}</time> : null}
          </span>
        </p>
      ) : null}
    </Link>
  );
}

export function ClipGrid({ clips }: { clips: ClipSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-4 md:px-5">
      {clips.map((clip) => (
        <li key={clip.id}>
          <ClipTile clip={clip} />
        </li>
      ))}
    </ul>
  );
}

/** Compact list row: poster left, text right. Used for related clips and liked clips. */
export function ClipRow({ clip, replace = false }: { clip: ClipSummary; replace?: boolean }) {
  return (
    <Link href={`/clip/${clip.id}`} replace={replace} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-hover md:px-5">
      <div className="relative w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
        <ClipThumb src={clip.thumbnailUrl} clipId={clip.id} photo={clip.kind === "photo"} />
        <VisibilityBadge visibility={clip.visibility} />
        <PhotoBadge clip={clip} />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-sm font-semibold leading-5">{clipTitle(clip)}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {clip.username ? `@${clip.username}` : null}
          {clip.username && typeof clip.viewsCount === "number" && clip.kind !== "photo" ? " · " : null}
          {typeof clip.viewsCount === "number" && clip.kind !== "photo" ? `${formatCount(clip.viewsCount)} views` : null}
        </p>
        {clip.createdAt ? (
          <p className="mt-0.5 text-xs text-muted">
            <time dateTime={clip.createdAt} suppressHydrationWarning>{formatRelativeTime(clip.createdAt)}</time>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
