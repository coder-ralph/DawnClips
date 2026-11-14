import type { Metadata } from "next";
import Link from "next/link";
import { ContactNote, LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteConfig } from "@/config/site";

const description = "The rules for using DawnClips: accounts, your content, acceptable use, reporting and moderation.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `Terms of Service · ${siteConfig.name}`,
    description,
    url: "/terms",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: { card: "summary_large_image", title: `Terms of Service · ${siteConfig.name}`, description, images: ["/og.png"] },
};

const sections: LegalSection[] = [
  { id: "agreement", title: "Using DawnClips" },
  { id: "accounts", title: "Your account" },
  { id: "content", title: "Your content" },
  { id: "rules", title: "Rules" },
  { id: "reports", title: "Reports and moderation" },
  { id: "deleting", title: "Deleting content and accounts" },
  { id: "service", title: "The service" },
  { id: "liability", title: "Warranties and liability" },
  { id: "changes", title: "Changes to these terms" },
  { id: "contact", title: "Contact" },
];

/*
 * Standard community-platform terms written around what the app actually does (see docs/legal-review.md).
 * CONFIRM and have reviewed before relying on them: operator identity, minimum age, governing law and venue,
 * how copyright complaints are handled, and the warranty and liability wording for your jurisdiction.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms are the rules for using DawnClips. By creating an account or using the service you agree to them. If you do not agree, please do not use DawnClips."
      sections={sections}
      other={{ href: "/privacy", label: "Read the Privacy Policy" }}
    >
      <h2 id="agreement">1. Using DawnClips</h2>
      <p>
        DawnClips is a community project where Mobile Legends: Bang Bang players share gameplay highlights. {siteConfig.disclaimer} Mobile
        Legends: Bang Bang and its names and game assets belong to their owners.
      </p>
      <p>
        How DawnClips handles your information is described in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2 id="accounts">2. Your account</h2>
      <ul>
        <li>You sign in with Google or an email code through Clerk. You are responsible for what happens under your account.</li>
        <li>Keep your sign-in details secure and tell us if you think your account has been misused.</li>
        <li>Do not impersonate other people or pick a username or display name meant to mislead.</li>
      </ul>

      <h2 id="content">3. Your content</h2>
      <p>
        You keep ownership of the clips and other content you post. To run the service, you give DawnClips permission to host, store, process
        (for example to create previews), display and stream your content, including in feeds, search, share previews and the embeddable player
        for public clips, for as long as the content is on DawnClips. This permission ends when you delete the content, except for copies in
        backups or caches that expire in the normal course.
      </p>
      <p>
        You are responsible for your content. Only post videos you have the right to share. Uploads are limited to MP4 files of up to 100 MB. You
        choose each clip&apos;s visibility: public, unlisted (anyone with the link) or private (only you).
      </p>

      <h2 id="rules">4. Rules</h2>
      <p>Do not post content or behave in ways that are:</p>
      <ul>
        <li>spam or deliberately misleading;</li>
        <li>harassing or bullying toward others;</li>
        <li>hateful toward people or groups;</li>
        <li>violent or that encourages violence;</li>
        <li>sexual content;</li>
        <li>infringing someone else&apos;s copyright or other rights; or</li>
        <li>unlawful.</li>
      </ul>
      <p>
        Also do not try to break, overload or probe the service, get around rate limits or other protections, or access content that is not
        meant for you.
      </p>

      <h2 id="reports">5. Reports and moderation</h2>
      <p>
        Signed-in users can report a clip, comment or profile, choosing a reason such as spam, harassment, hate, violence, sexual content,
        copyright or other. Reports are reviewed by the people who run DawnClips, who may remove content or accounts that break these terms. If you
        believe something infringes your copyright, report it with the copyright reason or contact us.
      </p>

      <h2 id="deleting">6. Deleting content and accounts</h2>
      <p>
        You can delete your clips at any time and delete your account from Settings. What is removed is described in the{" "}
        <Link href="/privacy#retention">Privacy Policy</Link>. DawnClips may also remove content or close accounts that break these terms.
      </p>

      <h2 id="service">7. The service</h2>
      <p>
        DawnClips is a community project. Features may change, and the service may be interrupted, limited or discontinued. DawnClips may update
        limits such as upload size.
      </p>

      <h2 id="liability">8. Warranties and liability</h2>
      <p>
        DawnClips is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. To the extent the law allows, the
        people who run DawnClips are not liable for indirect or consequential losses, or for content posted by users. Nothing in these terms limits
        rights you have under the law that cannot be limited.
      </p>

      <h2 id="changes">9. Changes to these terms</h2>
      <p>When these terms change, this page will be updated and the date at the top will change. Continuing to use DawnClips means you accept the updated terms.</p>

      <h2 id="contact">10. Contact</h2>
      <ContactNote />
    </LegalPage>
  );
}
