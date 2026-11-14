import Link from "next/link";
import { MobileMenu } from "@/components/marketing/mobile-menu";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export const marketingNav = [
  { href: "/about#features", label: "Features" },
  { href: "/about#how-it-works", label: "How it works" },
  { href: "/about#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/about" aria-label="DawnClips home" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {marketingNav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-hover hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-in" className={buttonClasses({ variant: "ghost" })}>Log in</Link>
          <Link href="/" className={buttonClasses()}>Open DawnClips</Link>
        </div>
        <MobileMenu items={marketingNav} />
      </div>
    </header>
  );
}
