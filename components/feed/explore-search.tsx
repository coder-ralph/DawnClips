"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Live search box. There is no Search button: results update while typing and on Enter. */
export function ExploreSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialQuery);
  const last = useRef(initialQuery);
  const timer = useRef<number | undefined>(undefined);

  function go(next: string) {
    const trimmed = next.trim();
    if (trimmed === last.current) return;
    last.current = trimmed;
    router.replace(trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname, { scroll: false });
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Browser back/forward or a hero-chip link changed the URL: keep the box in sync.
  useEffect(() => {
    if (initialQuery !== last.current) {
      last.current = initialQuery;
      setValue(initialQuery);
    }
  }, [initialQuery]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        window.clearTimeout(timer.current);
        go(value);
      }}
      className="relative"
    >
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={value}
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Search hero name, or by role, lane"
        placeholder="Search hero name, or by role, lane"
        onChange={(event) => {
          setValue(event.target.value);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => go(event.target.value), 300);
        }}
        className="h-11 w-full rounded-full border border-line-strong bg-background pl-10 pr-10 text-[15px] placeholder:text-muted hover:border-foreground/50 focus-visible:border-accent-text"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            go("");
          }}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </form>
  );
}
