"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export function HeroSearch({ heroes }: { heroes: Array<{ id: string; name: string; role: string; count: number }> }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () => heroes.filter((hero) => hero.name.toLowerCase().includes(query.trim().toLowerCase())),
    [heroes, query],
  );

  return (
    <div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search heroes"
          aria-label="Search trending heroes"
          className="h-10 w-full rounded-full border border-line-strong bg-background pl-10 pr-4 text-sm placeholder:text-muted hover:border-foreground/50 focus-visible:border-accent-text"
        />
      </div>
      {matches.length === 0 ? (
        <p className="mt-4 px-1 text-sm text-muted">{heroes.length === 0 ? "Heroes appear once clips are tagged." : "No trending heroes match."}</p>
      ) : (
        <ol className="mt-2">
          {matches.slice(0, 6).map((hero, index) => (
            <li key={hero.id}>
              <Link href={`/explore?q=${encodeURIComponent(hero.name)}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-hover">
                <span className="w-4 text-center text-sm font-semibold tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{hero.name}</span>
                  <span className="block truncate text-xs capitalize text-muted">{hero.role || "Hero"}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{hero.count} {hero.count === 1 ? "clip" : "clips"}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
