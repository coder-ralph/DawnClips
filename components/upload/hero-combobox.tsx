"use client";

import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { heroLane, laneLabels, roleLabel, searchHeroes, slugifyTag, tagLabel } from "@/lib/heroes";
import { cn } from "@/lib/utils";

const MAX_HEROES = 5;

/**
 * GitHub-topics style tag picker. Suggestions are computed locally from the
 * static hero list (name, role or lane), so they appear instantly and work
 * offline. Implements the WAI-ARIA combobox + listbox pattern.
 */
type Option = { kind: "hero"; id: string; name: string; meta: string } | { kind: "custom"; id: string; name: string };

export function HeroCombobox({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const full = selected.length >= MAX_HEROES;

  // Hero matches first, then "Add “whatever you typed”" so any hero, role or lane can be tagged freely.
  const options = useMemo<Option[]>(() => {
    const text = query.trim();
    if (!text) return [];
    const list: Option[] = searchHeroes(text)
      .filter((hero) => !selected.includes(hero.id))
      .slice(0, 30)
      .map((hero) => ({ kind: "hero", id: hero.id, name: hero.name, meta: `${roleLabel(hero.role)} · ${laneLabels[heroLane(hero)]}` }));
    const slug = slugifyTag(text);
    if (slug && !selected.includes(slug) && !list.some((option) => option.id === slug)) {
      list.push({ kind: "custom", id: slug, name: tagLabel(slug) });
    }
    return list;
  }, [query, selected]);
  const showList = open && !full && options.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;
  const current = options[Math.min(active, options.length - 1)];

  function add(id: string) {
    if (full || selected.includes(id)) return;
    onChange([...selected, id]);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }

  function addCustomFromQuery() {
    const slug = slugifyTag(query);
    if (slug) add(slug);
  }

  function remove(id: string) {
    onChange(selected.filter((item) => item !== id));
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((value) => (options.length ? (value + 1) % options.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (options.length ? (value - 1 + options.length) % options.length : 0));
    } else if (event.key === "Enter") {
      // Enter picks the highlighted option; it must never submit the surrounding form.
      if (showList && current) {
        event.preventDefault();
        add(current.id);
      } else if (query) {
        event.preventDefault();
      }
    } else if (event.key === "," ) {
      // A comma adds exactly what was typed as a custom tag.
      event.preventDefault();
      addCustomFromQuery();
    } else if (event.key === "Tab" && showList && current) {
      add(current.id);
      event.preventDefault();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Backspace" && !query && selected.length) {
      onChange(selected.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={`${listId}-input`} className="text-sm font-medium">
          Heroes, roles &amp; lanes <span className="font-normal text-muted">(optional)</span>
        </label>
        <span className="text-xs tabular-nums text-muted" aria-live="polite">{selected.length}/{MAX_HEROES}</span>
      </div>
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line-strong px-2.5 py-1.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text",
          disabled && "opacity-60",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((id) => {
          const label = tagLabel(id);
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-sm font-medium text-accent-text">
              {label}
              <button
                type="button"
                onClick={() => remove(id)}
                disabled={disabled}
                aria-label={`Remove ${label}`}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-active"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? optionId(Math.min(active, options.length - 1)) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled || full}
          value={query}
          placeholder={full ? "Maximum of 5 tags" : selected.length ? "Add another tag" : "Type a hero, role or lane (e.g. Terizla, Fighter, Exp lane)"}
          onChange={(event) => {
            setQuery(event.target.value.replace(/,/g, ""));
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-muted"
        />
      </div>
      {query.trim() && !full ? (
        <p className="mt-1.5 px-1 text-xs text-muted">Press Enter to pick the highlighted option, or comma to add “{query.trim()}” as typed.</p>
      ) : null}

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tag suggestions"
          className="mt-2 max-h-56 overflow-y-auto rounded-xl border bg-background p-1.5"
        >
          {options.map((option, index) => (
            <li
              key={`${option.kind}-${option.id}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // Keep focus in the input so blur does not close the list before the tap registers.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(option.id)}
              onMouseMove={() => setActive(index)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                index === active ? "bg-hover" : "",
              )}
            >
              {option.kind === "hero" ? (
                <>
                  <span className="font-medium">{option.name}</span>
                  <span className="text-xs text-muted">{option.meta}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">Add “{option.name}”</span>
                  <span className="text-xs text-muted">Custom tag</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
