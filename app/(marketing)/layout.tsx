import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

/**
 * Public pages outside the app shell: the landing page and the legal pages.
 * Nothing here depends on who is signed in, so these routes prerender completely.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-root flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
