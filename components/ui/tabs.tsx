"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const tabClass =
  "relative flex h-12 min-w-fit flex-1 items-center justify-center whitespace-nowrap px-4 text-sm font-semibold transition-colors";

function Indicator() {
  return <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent-text" />;
}

/** Tabs that are real links (profile, explore). Navigation semantics, not a tablist. */
export function LinkTabs({
  items,
  label,
  className,
}: {
  items: Array<{ href: string; label: string; active: boolean }>;
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("border-b bg-background", className)}>
      <ul className="no-scrollbar flex overflow-x-auto">
        {items.map((item) => (
          <li key={item.href} className="flex flex-1">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              scroll={false}
              className={cn(tabClass, item.active ? "text-foreground" : "text-muted hover:bg-hover hover:text-foreground")}
            >
              {item.label}
              {item.active ? <Indicator /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** In-page tabs that switch a panel. Follows the WAI-ARIA tabs pattern with roving focus. */
export function ButtonTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
  panelId,
  className,
}: {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
  panelId: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = items.length - 1;
    let next = index;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex overflow-x-auto border-b bg-background", className)}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${item.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(tabClass, selected ? "text-foreground" : "text-muted hover:bg-hover hover:text-foreground")}
          >
            {item.label}
            {selected ? <Indicator /> : null}
          </button>
        );
      })}
    </div>
  );
}
