"use client";

import { Show, SignInButton, useClerk } from "@clerk/nextjs";
import { Bookmark, LogIn, LogOut, Menu, Settings } from "lucide-react";
import { ActionMenu, type MenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The single place for account actions. Replaces the old Profile link +
 * Clerk UserButton pair, which put the same avatar on screen twice.
 */
export function AccountMenu({ variant }: { variant: "sidebar" | "header" }) {
  const { signOut } = useClerk();
  const items: MenuItem[] = [
    { label: "Settings", icon: Settings, href: "/settings" },
    ...(variant === "header" ? [{ label: "Saved", icon: Bookmark, href: "/saved" }] : []),
    { label: "Sign out", icon: LogOut, onSelect: () => void signOut({ redirectUrl: "/" }), danger: true },
  ];

  return (
    <>
      <Show when="signed-in">
        <ActionMenu
          label={variant === "sidebar" ? "More" : "Account menu"}
          items={items}
          side={variant === "sidebar" ? "top" : "bottom"}
          align={variant === "sidebar" ? "start" : "end"}
          className={variant === "sidebar" ? "w-full" : undefined}
          buttonClassName={cn(
            variant === "sidebar"
              ? "flex h-12 w-full items-center justify-center gap-4 rounded-xl px-3 text-[17px] font-medium text-foreground/85 hover:bg-hover xl:justify-start"
              : "flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-hover",
          )}
        >
          <Menu aria-hidden="true" className="h-6 w-6" />
          {variant === "sidebar" ? <span className="sr-only xl:not-sr-only">More</span> : null}
        </ActionMenu>
      </Show>
      <Show when="signed-out">
        {variant === "sidebar" ? (
          <>
            <SignInButton mode="redirect">
              <span className="xl:hidden">
                <Button size="icon" aria-label="Log in">
                  <LogIn aria-hidden="true" className="h-5 w-5" />
                </Button>
              </span>
            </SignInButton>
            <SignInButton mode="redirect">
              <span className="hidden xl:block">
                <Button size="lg" fullWidth>Log in</Button>
              </span>
            </SignInButton>
          </>
        ) : (
          <SignInButton mode="redirect">
            <Button size="sm">Log in</Button>
          </SignInButton>
        )}
      </Show>
    </>
  );
}
