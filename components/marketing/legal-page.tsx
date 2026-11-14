import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { siteConfig } from "@/config/site";

export type LegalSection = { id: string; title: string };

/** Shared frame for the Privacy Policy and Terms of Service. */
export function LegalPage({
  title,
  intro,
  sections,
  other,
  children,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  other: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-glow border-b">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <Link href="/about" className="inline-flex items-center gap-2 rounded text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to DawnClips
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {siteConfig.legalUpdated}</p>
        <p className="mt-5 text-lg leading-8 text-muted">{intro}</p>

        <nav aria-label="On this page" className="mt-8 rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">On this page</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="rounded text-muted transition-colors hover:text-foreground">
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-prose mt-4">{children}</div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm">
          <Link href="/about" className="rounded text-muted transition-colors hover:text-foreground">← Back to the landing page</Link>
          <Link href={other.href} className="rounded text-accent-text underline underline-offset-4">{other.label}</Link>
        </div>
      </div>
    </div>
  );
}

/** Where people can reach the operator. Uses NEXT_PUBLIC_CONTACT_EMAIL when set, otherwise the GitHub repository. */
export function ContactNote() {
  return siteConfig.contactEmail ? (
    <p>
      You can reach the person who runs DawnClips at <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>.
    </p>
  ) : (
    <p>
      You can reach the person who runs DawnClips through the project&apos;s GitHub repository at{" "}
      <a href={siteConfig.repoUrl} target="_blank" rel="noopener noreferrer">{siteConfig.repoUrl.replace("https://", "")}</a>. Please do not
      post personal information in a public issue.
    </p>
  );
}
