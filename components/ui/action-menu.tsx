"use client";

import { Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  /** When set, the item acts as a radio option and shows a check mark if true. */
  checked?: boolean;
  /** Optional trailing text such as a countdown. */
  meta?: string;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
};

/**
 * Small accessible popover menu (WAI-ARIA menu button pattern): arrow keys,
 * Home/End, Escape, outside click, and focus returns to the trigger.
 */
export function ActionMenu({
  label,
  items,
  children,
  align = "end",
  side = "bottom",
  className,
  buttonClassName,
}: {
  label: string;
  items: MenuItem[];
  children: React.ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])');
    first?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (index + 1) % nodes.length;
    else if (event.key === "ArrowUp") next = (index - 1 + nodes.length) % nodes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = nodes.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
    nodes[next]?.focus();
  }

  const itemClass = (danger?: boolean) =>
    cn(
      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-hover focus-visible:bg-hover focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
      danger ? "text-danger" : "text-foreground",
    );

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonClassName}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-30 min-w-52 rounded-xl border bg-background p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.3)]",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon ? <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" /> : null}
                <span className="flex-1">{item.label}</span>
                {item.meta ? <span className="text-xs font-normal tabular-nums text-muted">{item.meta}</span> : null}
                {item.checked ? <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-text" /> : null}
              </>
            );
            const node = item.href ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={itemClass(item.danger)}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked === undefined ? undefined : item.checked}
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={itemClass(item.danger)}
              >
                {content}
              </button>
            );
            return item.separatorBefore ? (
              <div key={item.label} role="none">
                <div role="separator" className="my-1.5 h-px bg-line" />
                {node}
              </div>
            ) : (
              node
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
