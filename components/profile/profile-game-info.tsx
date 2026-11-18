import { RankBadge } from "@/components/profile/rank-badge";
import { formatRoles, formatStars, isRank } from "@/lib/mlbb-profile";

/** Peak rank and main roles on the public profile. Shows only what the player filled in; nothing at all when neither is set. */
export function ProfileGameInfo({
  highestRank,
  rankStars,
  favoriteRoles,
}: {
  highestRank: string | null;
  rankStars: number | null;
  favoriteRoles: readonly string[];
}) {
  const rank = isRank(highestRank) ? highestRank : null;
  const roles = formatRoles(favoriteRoles);
  if (!rank && !roles) return null;

  return (
    <dl className="mt-3 space-y-2 text-sm">
      {rank ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <dt className="text-muted">Peak rank</dt>
          <dd className="flex items-center gap-2">
            <RankBadge rank={rank} />
            {rankStars !== null ? <span className="tabular-nums text-muted">· {formatStars(rankStars)}</span> : null}
          </dd>
        </div>
      ) : null}
      {roles ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <dt className="text-muted">Main roles</dt>
          <dd className="font-medium">{roles}</dd>
        </div>
      ) : null}
    </dl>
  );
}
