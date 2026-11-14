export { reservedUsernames } from "@/lib/username";

export const siteConfig = {
  name: "DawnClips",
  tagline: "Your MLBB moments. Your community.",
  description:
    "DawnClips is a community for Mobile Legends: Bang Bang players to share gameplay highlights.",
  // NEXT_PUBLIC_SITE_URL wins. On Vercel the production hostname is the fallback, so share previews never point at localhost.
  url:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  author: {
    name: "coder-ralph",
    url: "https://github.com/coder-ralph",
  },
  repoUrl: "https://github.com/coder-ralph/DawnClips",
  // Optional. When set (NEXT_PUBLIC_CONTACT_EMAIL) the legal pages show a mailto link.
  // Without it they point to the project's GitHub repository.
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  copyrightYear: 2026,
  legalUpdated: "November 14, 2026",
  disclaimer:
    "DawnClips is an unofficial community project and is not endorsed by or affiliated with Moonton or Mobile Legends: Bang Bang.",
} as const;
