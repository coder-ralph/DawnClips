"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/ui/field";
import { countries, countryName, otherCountries, pinnedCountries, searchCountries, type Country } from "@/lib/countries";
import { cn } from "@/lib/utils";

const listMaxHeight = 240;

/**
 * Searchable country picker: a text box with a list under it (WAI-ARIA combobox). Clicking opens the full list, the
 * pinned countries first, a divider, then everyone else A-Z. Typing filters it. Arrow keys move, Enter picks, Escape
 * closes the list only (a second Escape closes the dialog). The chosen ISO alpha-2 code goes out in a hidden field
 * named `name`, so it works inside a plain <form action>.
 */
export function CountrySelect({ id, name, defaultValue }: { id: string; name: string; defaultValue: string }) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [text, setText] = useState(() => countryName(defaultValue));
  // True once something was typed since the list opened. Until then the whole list shows, not just a match for the current name.
  const [typed, setTyped] = useState(false);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => (typed ? searchCountries(text) : countries), [typed, text]);
  const optionId = useCallback((country: Country) => `${listId}-${country.code}`, [listId]);
  const activeOption = open ? options[active] : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setTyped(false);
    setText(countryName(value));
  }, [value]);

  function openList() {
    if (open) return;
    // Open upward when there is little room below (end of a scrolling dialog, or the keyboard on a phone).
    const input = inputRef.current;
    if (input) {
      const rect = input.getBoundingClientRect();
      const dialogRect = input.closest("dialog")?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const floor = Math.min(dialogRect?.bottom ?? Infinity, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      const below = floor - rect.bottom;
      const room = rect.top - (dialogRect?.top ?? 0);
      setAbove(below < listMaxHeight + 16 && room > below);
    }
    setActive(Math.max(0, countries.findIndex((country) => country.code === value)));
    setOpen(true);
  }

  function select(country: Country) {
    setValue(country.code);
    setText(country.label);
    setTyped(false);
    setOpen(false);
  }

  // Keep the highlighted row visible inside the list, without moving the dialog behind it.
  useEffect(() => {
    if (!open || !activeOption) return;
    const list = listRef.current;
    const row = document.getElementById(optionId(activeOption));
    if (!list || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, activeOption, optionId]);

  // Opened with the mouse on a long list: start with the chosen country in view, not at the top.
  useEffect(() => {
    if (!open || typed) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && row) list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2);
  }, [open, typed]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open) {
      // Picking from the list must not also submit the form.
      event.preventDefault();
      if (activeOption) select(activeOption);
    } else if (event.key === "Escape" && open) {
      // Close the list only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  const showGroups = !typed;
  const row = (country: Country, index: number) => {
    const selected = country.code === value;
    return (
      <div
        key={country.code}
        id={optionId(country)}
        role="option"
        aria-selected={selected}
        onMouseMove={() => setActive(index)}
        onClick={() => select(country)}
        className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", index === active && "bg-hover")}
      >
        <span className="min-w-0 flex-1 truncate">{country.label}</span>
        {selected ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-text" /> : null}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Search for a country"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setTyped(true);
          setActive(0);
          if (!open) openList();
        }}
        onFocus={(event) => event.target.select()}
        onClick={openList}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={cn(inputClass, "pr-9")}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) close();
          else {
            inputRef.current?.focus();
            openList();
          }
        }}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {open ? (options.length ? `${options.length} ${options.length === 1 ? "country" : "countries"}` : "No countries found") : ""}
      </div>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Countries"
          // Keeps the text box focused while the list is clicked or scrolled with its scrollbar.
          onMouseDown={(event) => event.preventDefault()}
          style={{ maxHeight: listMaxHeight }}
          className={cn(
            "absolute inset-x-0 z-30 overflow-y-auto overscroll-contain rounded-xl border bg-background p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.3)]",
            above ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted">No country found.</div>
          ) : showGroups ? (
            <>
              <div role="group" aria-label="Popular in Mobile Legends">
                {pinnedCountries.map((country, index) => row(country, index))}
              </div>
              <div role="presentation" aria-hidden="true" className="mx-2 my-1.5 border-t" />
              <div role="group" aria-label="All countries">
                {otherCountries.map((country, index) => row(country, pinnedCountries.length + index))}
              </div>
            </>
          ) : (
            options.map((country, index) => row(country, index))
          )}
        </div>
      ) : null}
    </div>
  );
}
