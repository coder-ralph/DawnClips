"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/ui/field";
import { canSelectRole, formatRoles, maxFavoriteRoles, normalizeRoles, roles, toggleRole, type RoleValue } from "@/lib/mlbb-profile";
import { cn } from "@/lib/utils";

const listMaxHeight = 320;

/**
 * Multi-select dropdown for favorite roles: up to two, and All-Rounder only on its own. Picking All-Rounder replaces
 * the other roles; picking another role replaces All-Rounder; a third role stays unavailable until one is removed. The
 * list stays open while choosing. Escape closes only the list (a second Escape closes the dialog). Each choice goes out
 * as a hidden `name` field, so it works inside a plain <form action>; the server enforces the same rules.
 */
export function FavoriteRolesSelect({ name, labelledBy, defaultValue }: { name: string; labelledBy: string; defaultValue: readonly string[] }) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<RoleValue[]>(() => normalizeRoles(defaultValue).slice(0, maxFavoriteRoles));
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(0);
  const optionId = (role: RoleValue) => `${listId}-${role}`;

  const close = useCallback(() => setOpen(false), []);

  function openList() {
    if (open) return;
    // Open upward when there is little room below (end of a scrolling dialog, or the keyboard on a phone).
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const dialogRect = button.closest("dialog")?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const floor = Math.min(dialogRect?.bottom ?? Infinity, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      const below = floor - rect.bottom;
      const room = rect.top - (dialogRect?.top ?? 0);
      // Upward only when the whole list fits above (the header sits over anything taller); otherwise it opens
      // downward and is scrolled into view below.
      setAbove(below < listMaxHeight + 16 && room >= listMaxHeight + 16);
    }
    setActive(Math.max(0, roles.findIndex((role) => selected.includes(role.value))));
    setOpen(true);
  }

  function toggle(role: RoleValue) {
    setSelected((current) => toggleRole(current, role));
  }

  // Opening downward at the end of a scrolling form: bring the whole list into view.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.min(roles.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList();
      else setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActive(roles.length - 1);
    } else if (event.key === " " || event.key === "Enter") {
      // Never submits the form from here; opens the list, then toggles the highlighted role.
      event.preventDefault();
      if (!open) openList();
      else toggle(roles[active].value);
    } else if (event.key === "Escape" && open) {
      // Close the list only; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  }

  const summary = formatRoles(selected);
  const full = selected.length >= maxFavoriteRoles;

  return (
    <div ref={rootRef} className="relative">
      {selected.map((role) => (
        <input key={role} type="hidden" name={name} value={role} />
      ))}
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={open ? optionId(roles[active].value) : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={cn(inputClass, "flex items-center justify-between gap-3 text-left")}
      >
        <span className={cn("min-w-0 flex-1 truncate", !summary && "text-muted")}>{summary || "Select up to two roles"}</span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <div role="status" aria-live="polite" className="sr-only">
        {open ? `${selected.length} of ${maxFavoriteRoles} selected` : ""}
      </div>
      {open ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Favorite roles"
          // Keeps the button focused while the list is clicked.
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            "absolute inset-x-0 z-30 rounded-xl border bg-background p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.3)]",
            above ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {roles.map((role, index) => {
            const checked = selected.includes(role.value);
            const disabled = !canSelectRole(selected, role.value);
            return (
              <div
                key={role.value}
                id={optionId(role.value)}
                role="option"
                aria-selected={checked}
                aria-disabled={disabled || undefined}
                onMouseMove={() => setActive(index)}
                onClick={() => {
                  if (!disabled) toggle(role.value);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                  index === active && !disabled && "bg-hover",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    checked ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                  )}
                >
                  {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{role.label}</span>
              </div>
            );
          })}
          <p aria-hidden="true" className={cn("mx-2 mt-1 border-t pt-2 text-xs", full ? "text-accent-text" : "text-muted")}>
            {selected.length} of {maxFavoriteRoles} selected
          </p>
        </div>
      ) : null}
    </div>
  );
}
