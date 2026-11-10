import { Compass, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipList } from "@/components/feed/clip-list";
import { FeedSkeleton } from "@/components/feed/clip-skeleton";
import { DiscoveryRail, DiscoveryRailSkeleton } from "@/components/feed/discovery-rail";
import { ExploreSearch } from "@/components/feed/explore-search";
import { UserRow } from "@/components/profile/user-row";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { exploreSearch, trendingSidebar } from "@/lib/clips";
import { resolveHeroQuery, tagLabel } from "@/lib/heroes";

export const metadata: Metadata = { title: "Explore" };

async function PopularHeroes() {
  const { heroes } = await trendingSidebar();
  if (heroes.length === 0) return null;
  return (
    <section aria-labelledby="popular-heroes" className="border-b px-4 py-3 md:px-5">
      <h2 id="popular-heroes" className="mb-2 text-sm font-semibold text-muted">Popular heroes</h2>
      <ul className="flex flex-wrap gap-2">
        {heroes.map((hero) => {
          const name = tagLabel(hero.id);
          return (
            <li key={hero.id}>
              <Link
                href={`/explore?q=${encodeURIComponent(name)}`}
                className="inline-flex h-8 items-center rounded-full border border-line-strong px-3.5 text-sm font-medium hover:bg-hover"
              >
                {name}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 60) ?? "";
  const tags = resolveHeroQuery(q);
  const result = await exploreSearch(q, tags);

  return (
    <>
      <div className="sticky top-12 z-10 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:top-14 md:px-5">
        <ExploreSearch initialQuery={q} />
      </div>
      {q ? null : (
        <Suspense fallback={null}>
          <PopularHeroes />
        </Suspense>
      )}

      {!result.ok ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-danger">Could not load results. Try again in a moment.</p>
          <Link href={q ? `/explore?q=${encodeURIComponent(q)}` : "/explore"} className="text-sm font-semibold text-accent-text hover:underline">Try again</Link>
        </div>
      ) : null}

      {result.ok && result.players.length > 0 ? (
        <section aria-labelledby="explore-players" className="border-b">
          <h2 id="explore-players" className="px-4 pb-1 pt-3 text-sm font-semibold text-muted md:px-5">Players</h2>
          <ul>
            {result.players.slice(0, 4).map((player) => (
              <li key={player.id}>
                <UserRow username={player.username} displayName={player.displayName} avatarUrl={player.avatarUrl} bio={player.bio} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.ok && result.clips.length > 0 ? (
        <section aria-labelledby="explore-clips">
          <h2 id="explore-clips" className="px-4 pb-1 pt-3 text-sm font-semibold text-muted md:px-5">
            {q ? "Clips" : "Latest highlights"}
          </h2>
          <ClipList key={q} clips={result.clips} />
        </section>
      ) : null}

      {result.ok && result.clips.length === 0 && result.players.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : Compass}
          title={q ? `No results for “${q}”` : "Nothing to explore yet"}
          body={
            q
              ? "Try a hero name, a role such as “mage”, or a lane such as “gold”."
              : "Highlights show up here as soon as players publish them."
          }
        />
      ) : null}
    </>
  );
}

export default function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  return (
    <PageContainer
      rail={
        <Suspense fallback={<DiscoveryRailSkeleton />}>
          <DiscoveryRail />
        </Suspense>
      }
    >
      <PageHeader title="Explore" />
      <Suspense fallback={<div className="p-4"><div className="skeleton h-11 rounded-full" /><FeedSkeleton count={1} /></div>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}
