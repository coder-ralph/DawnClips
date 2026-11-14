"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";

type NavItem = { href: string; label: string };

/** Small-screen navigation for the landing and legal pages. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover active:bg-active"
      >
        {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
      </button>
      {open ? (
        <div id={panelId} className="absolute inset-x-0 top-full border-b bg-background px-4 pb-5 pt-2 shadow-xl">
          <nav aria-label="Mobile" className="flex flex-col">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base text-foreground hover:bg-hover"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex gap-3 px-1">
            <Link href="/sign-in" className={buttonClasses({ variant: "secondary", size: "lg", className: "flex-1" })}>Log in</Link>
            <Link href="/" className={buttonClasses({ size: "lg", className: "flex-1" })}>Open app</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
