export { reservedUsernames } from "@/lib/username";

export const siteConfig = {
  name: "DawnClips",
  tagline: "Your MLBB moments. Your community.",
  description:
    "DawnClips is a community for Mobile Legends: Bang Bang players to share gameplay highlights.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  disclaimer:
    "DawnClips is an unofficial community project and is not endorsed by or affiliated with Moonton or Mobile Legends: Bang Bang.",
} as const;
