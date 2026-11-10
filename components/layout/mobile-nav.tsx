"use client";

import { Bell, Compass, Home, Plus, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath } from "@/components/layout/sidebar-nav";
import { openUploadModal } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

export function MobileNav({
  signedIn,
  profileHref,
  unread,
}: {
  signedIn: boolean;
  profileHref: string | null;
  unread: number;
}) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: signedIn ? "/upload" : "/sign-in", label: "New clip", icon: Plus, primary: true },
    { href: "/notifications", label: "Alerts", icon: Bell, badge: unread },
    {
      href: signedIn ? (profileHref ?? "/settings") : "/sign-in",
      label: signedIn ? "Profile" : "Log in",
      icon: User,
    },
  ];

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.label}>
              {item.primary && signedIn ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={openUploadModal}
                  className="flex h-14 w-full flex-col items-center justify-center"
                >
                  <span className="flex h-8 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
                    <Icon aria-hidden="true" strokeWidth={2.8} className="h-5 w-5" />
                  </span>
                  <span className="sr-only">{item.label}</span>
                </button>
              ) : (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {item.primary ? (
                  <>
                    <span className="flex h-8 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
                      <Icon aria-hidden="true" strokeWidth={2.8} className="h-5 w-5" />
                    </span>
                    <span className="sr-only">{item.label}</span>
                  </>
                ) : (
                  <>
                    <span className="relative">
                      <Icon aria-hidden="true" strokeWidth={active ? 2.6 : 2} className={cn("h-6 w-6", active && "text-accent-text")} />
                      {"badge" in item && item.badge ? (
                        <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg">
                          {item.badge > 9 ? "9+" : item.badge}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </span>
                    {item.label}
                  </>
                )}
              </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
