import type { Metadata } from "next";
import Link from "next/link";
import { ContactNote, LegalPage, type LegalSection } from "@/components/marketing/legal-page";
import { siteConfig } from "@/config/site";

const description = "How DawnClips handles your account, content and activity data, which providers it uses, and how to delete your data.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `Privacy Policy · ${siteConfig.name}`,
    description,
    url: "/privacy",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: { card: "summary_large_image", title: `Privacy Policy · ${siteConfig.name}`, description, images: ["/og.png"] },
};

const sections: LegalSection[] = [
  { id: "who", title: "Who runs DawnClips" },
  { id: "collect", title: "Information we collect" },
  { id: "cookies", title: "Cookies and browser storage" },
  { id: "use", title: "How we use information" },
  { id: "share", title: "Who we share information with" },
  { id: "visibility", title: "What other people can see" },
  { id: "retention", title: "Deleting your data" },
  { id: "choices", title: "Your choices" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
];

/*
 * Every statement below was checked against the application code and database schema (see docs/legal-review.md).
 * CONFIRM before publishing widely: operator identity, contact address, minimum age, backup retention,
 * governing law and any rights required where you operate. Those are intentionally not stated here.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy describes what information DawnClips collects, why, who it is shared with, and the choices you have. It describes how the app works today, in plain language."
      sections={sections}
      other={{ href: "/terms", label: "Read the Terms of Service" }}
    >
      <h2 id="who">1. Who runs DawnClips</h2>
      <p>
        DawnClips is a community project for Mobile Legends: Bang Bang players, run by {siteConfig.author.name}. {siteConfig.disclaimer}
      </p>

      <h2 id="collect">2. Information we collect</h2>
      <h3>Account information</h3>
      <p>
        You sign in with Google or a one-time code sent to your email. Sign-in is handled by Clerk, our authentication provider. DawnClips
        keeps a profile linked to your Clerk account that includes your Clerk user ID, your email address and whether it is verified, your name
        (used as your first display name) and a link to your profile picture. Your email address is not shown on your public profile.
      </p>
      <h3>Profile details you add</h3>
      <p>
        You can set a username, display name, bio, country, Role ID, Zone ID and language. Your Zone ID is private. Your Role ID is shown on your
        profile.
      </p>
      <h3>Content and interactions</h3>
      <ul>
        <li>Videos (MP4) and optional cover images you upload, with their titles, descriptions, hero tags and timestamped moments.</li>
        <li>Comments and replies you write.</li>
        <li>Your likes, saved clips, follows, blocks, and reports you file.</li>
      </ul>
      <h3>Viewing activity</h3>
      <p>
        When a signed-in person views a clip, DawnClips records that they viewed it (once per clip) and how long they watched. Visitors who are
        not signed in can watch public clips; their views add to the clip&apos;s view count and watch time can be recorded without being linked to
        an account. Creators see totals for their own clips (plays, viewers and watch time over 7, 30 or 90 days), not who watched.
      </p>
      <h3>Notifications, settings and abuse prevention</h3>
      <p>
        DawnClips stores in-app notifications (for example likes, comments, replies and follows) and your preferences for notifications, theme,
        language, autoplay, muted playback and profile privacy. To limit abuse, it also keeps counters of how often an account performs certain
        actions within a time window.
      </p>
      <h3>Technical information</h3>
      <p>
        The providers that host and deliver DawnClips process technical information such as your IP address, browser and request details when you
        use the site. DawnClips&apos;s own code does not add analytics or advertising trackers.
      </p>

      <h2 id="cookies">3. Cookies and browser storage</h2>
      <ul>
        <li>
          <strong>Sign-in cookies.</strong> Clerk sets cookies (for example <code>__session</code> and <code>__client_uat</code>) that keep you
          signed in and secure your session.
        </li>
        <li>
          <strong>Preference cookies.</strong> When you save your settings, DawnClips sets <code>dawnclips-language</code> and{" "}
          <code>dawnclips-theme</code> cookies for up to one year so pages load in your chosen language and theme.
        </li>
        <li>
          <strong>Browser storage.</strong> DawnClips keeps <code>dawnclips-theme</code>, <code>dawnclips-language</code>,{" "}
          <code>dawnclips:autoplay</code> and <code>dawnclips:muted</code> in your browser&apos;s local storage to remember your preferences on
          that device.
        </li>
      </ul>
      <p>
        DawnClips does not set advertising or analytics cookies. You can clear cookies and site data in your browser at any time. You will be
        signed out and your saved preferences on that device will reset.
      </p>

      <h2 id="use">4. How we use information</h2>
      <ul>
        <li>To run DawnClips: sign you in, show profiles and clips, build feeds and search, and power likes, comments, saves and follows.</li>
        <li>To show creators how their clips perform.</li>
        <li>To send in-app notifications you have not turned off.</li>
        <li>To keep the service safe: rate limiting, handling reports, and removing content or accounts that break the Terms.</li>
        <li>To remember your preferences.</li>
      </ul>

      <h2 id="share">5. Who we share information with</h2>
      <p>DawnClips relies on these service providers to operate. Each processes data under its own terms and privacy policy.</p>
      <ul>
        <li><strong>Clerk</strong> for sign-in, sessions and the account profile (name, email, picture).</li>
        <li><strong>Google</strong>, only if you choose to continue with Google. This happens through Clerk.</li>
        <li><strong>Supabase</strong> for the database that stores profiles, clip details, comments, likes, follows and similar records.</li>
        <li>
          <strong>Cloudflare R2</strong> for storing videos and cover images. Uploads go directly from your browser to storage. Clips that are not
          public are delivered with short-lived signed links.
        </li>
        <li><strong>Vercel</strong> for hosting the website and its server functions.</li>
      </ul>

      <h2 id="visibility">6. What other people can see</h2>
      <ul>
        <li>
          <strong>Public clips and profiles</strong> can be seen by anyone, with or without an account, can appear in feeds and search, and may be
          indexed by search engines. Public clips can also be embedded on other websites, and link previews show a profile or clip&apos;s name and
          picture.
        </li>
        <li><strong>Unlisted clips</strong> are not listed but can be opened by anyone who has the link.</li>
        <li><strong>Private clips</strong> are visible only to you.</li>
        <li>
          Your public profile shows your display name, username, picture, bio, country, Role ID, join month and follower, following and highlight
          counts. In Settings you can hide highlights, following, followers, comments and likes.
        </li>
        <li>Comments you write on public clips are visible to people who can see those clips.</li>
      </ul>

      <h2 id="retention">7. Deleting your data</h2>
      <ul>
        <li>
          <strong>Deleting a clip</strong> removes the video and cover image from storage and deletes the clip along with its likes, comments,
          saves, views and moments.
        </li>
        <li>
          <strong>Deleting your account</strong> (Settings, then Delete account, then type DELETE) removes your videos and cover images, your clips
          and everything attached to them, your own likes, comments, saves, follows, blocks and notifications, reports you filed, your settings,
          your profile and your Clerk sign-in account. Watch-time records from your own viewing are kept without a link to you.
        </li>
        <li>Providers may keep backups or logs for a limited time under their own policies.</li>
      </ul>

      <h2 id="choices">8. Your choices</h2>
      <ul>
        <li>Edit your profile and preferences in Settings and Edit profile.</li>
        <li>Choose the visibility of each clip and who can comment on it.</li>
        <li>Block accounts and report clips, comments or profiles.</li>
        <li>Delete clips or your whole account at any time.</li>
      </ul>
      <p>
        To ask a question about your data or request a correction, contact us. DawnClips does not currently offer a self-service data export.
        Depending on where you live you may have additional rights under local law.
      </p>

      <h2 id="changes">9. Changes to this policy</h2>
      <p>
        If DawnClips changes how it handles information, this page will be updated and the date at the top will change. See also the{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2 id="contact">10. Contact</h2>
      <ContactNote />
    </LegalPage>
  );
}
