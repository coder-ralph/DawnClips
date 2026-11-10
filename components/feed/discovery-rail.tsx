import Link from "next/link";
import { HeroSearch } from "@/components/feed/hero-search";
import { Avatar } from "@/components/ui/avatar";
import { siteConfig } from "@/config/site";
import { trendingSidebar } from "@/lib/clips";
import { heroById, tagLabel } from "@/lib/heroes";

/** Right-hand rail for Home and Explore (wide screens only). */
export async function DiscoveryRail() {
  const sidebar = await trendingSidebar();
  return (
    <div className="space-y-7">
      <section aria-labelledby="rail-heroes">
        <h2 id="rail-heroes" className="mb-3 px-1 text-base font-bold">Trending heroes</h2>
        <HeroSearch
          heroes={sidebar.heroes.map((hero) => ({
            id: hero.id,
            name: tagLabel(hero.id),
            role: heroById(hero.id)?.role ?? "",
            count: hero.count,
          }))}
        />
      </section>
      <section aria-labelledby="rail-creators">
        <h2 id="rail-creators" className="mb-2 px-1 text-base font-bold">Popular creators</h2>
        {sidebar.creators.length === 0 ? (
          <p className="px-1 text-sm text-muted">Creators appear after clips are published.</p>
        ) : (
          <ul>
            {sidebar.creators.map((creator) => (
              <li key={creator.username}>
                <Link href={`/profile/${creator.username}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover">
                  <Avatar src={creator.avatarUrl} name={creator.displayName} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{creator.displayName}</span>
                    <span className="block truncate text-xs text-muted">@{creator.username}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{creator.count} {creator.count === 1 ? "clip" : "clips"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="px-1 text-[11px] leading-4 text-muted">{siteConfig.disclaimer}</p>
    </div>
  );
}

export function DiscoveryRailSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 px-1">
      {[0, 1, 2, 3, 4].map((key) => (
        <div key={key} className="skeleton h-11 rounded-xl" />
      ))}
    </div>
  );
}
