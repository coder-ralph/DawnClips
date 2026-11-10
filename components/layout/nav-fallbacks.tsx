import { Compass, Home } from "lucide-react";
import Link from "next/link";

/*
 * Static stand-ins shown while the signed-in navigation streams in. They avoid
 * usePathname() because Suspense fallbacks are prerendered.
 */

export function SidebarNavFallback() {
  const link = "flex h-12 items-center justify-center gap-4 rounded-xl px-3 text-[17px] font-medium text-foreground/85 hover:bg-hover xl:justify-start";
  return (
    <nav aria-label="Primary" className="mt-4 flex flex-col gap-1">
      <Link href="/" className={link}>
        <Home aria-hidden="true" className="h-6 w-6" />
        <span className="sr-only xl:not-sr-only">Home</span>
      </Link>
      <Link href="/explore" className={link}>
        <Compass aria-hidden="true" className="h-6 w-6" />
        <span className="sr-only xl:not-sr-only">Explore</span>
      </Link>
      {[0, 1, 2].map((key) => (
        <div key={key} aria-hidden="true" className="flex h-12 items-center justify-center gap-4 px-3 xl:justify-start">
          <span className="skeleton h-6 w-6 rounded-md" />
          <span className="skeleton hidden h-4 w-24 rounded xl:block" />
        </div>
      ))}
    </nav>
  );
}

export function MobileNavFallback() {
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-20 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur md:hidden"
    />
  );
}
