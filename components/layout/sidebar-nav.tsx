"use client";

import { Bell, Bookmark, Compass, Home, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = {
  signedIn: boolean;
  profileHref: string | null;
  unread: number;
};

export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ signedIn, profileHref, unread }: Props) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    ...(signedIn
      ? [
          { href: "/notifications", label: "Notifications", icon: Bell, badge: unread },
          { href: "/saved", label: "Saved", icon: Bookmark },
          { href: profileHref ?? "/settings", label: "Profile", icon: User },
        ]
      : []),
  ];

  return (
    <nav aria-label="Primary" className="mt-4 flex flex-col gap-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        const badge = "badge" in item ? item.badge : 0;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-12 items-center justify-center gap-4 rounded-xl px-3 text-[17px] transition-colors hover:bg-hover xl:justify-start",
              active ? "bg-hover font-bold text-foreground" : "font-medium text-foreground/85",
            )}
          >
            <span className="relative">
              <Icon aria-hidden="true" strokeWidth={active ? 2.6 : 2} className={cn("h-6 w-6", active && "text-accent-text")} />
              {badge ? (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg">
                  {badge > 9 ? "9+" : badge}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </span>
            <span className="sr-only xl:not-sr-only">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
