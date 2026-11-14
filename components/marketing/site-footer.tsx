import Link from "next/link";
import { marketingNav } from "@/components/marketing/site-header";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/config/site";

const appLinks = [
  { href: "/", label: "Open DawnClips" },
  { href: "/explore", label: "Explore clips" },
  { href: "/sign-up", label: "Create an account" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

const linkClass = "rounded text-sm text-muted transition-colors hover:text-foreground";

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={linkClass}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link href="/about" aria-label="DawnClips home" className="inline-block rounded-lg">
              <Logo />
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted">
              A community for Mobile Legends: Bang Bang players to share gameplay highlights and find the plays worth rewatching.
            </p>
          </div>
          <FooterColumn title="Explore" links={marketingNav} />
          <FooterColumn title="App" links={appLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
        </div>

        <div className="mt-10 space-y-3 border-t pt-6 text-center text-xs leading-5 text-muted">
          <p className="mx-auto max-w-2xl">{siteConfig.disclaimer}</p>
          <p>© {siteConfig.copyrightYear} {siteConfig.name}. All rights reserved.</p>
          <a
            href={siteConfig.author.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 rounded text-xs text-muted transition-colors hover:text-foreground"
          >
            <span>Made with ❤️ by</span>
            <span className="underline decoration-wavy decoration-[var(--border-strong)] underline-offset-[4px] transition-colors group-hover:decoration-[var(--accent-text)]">
              {siteConfig.author.name}
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
