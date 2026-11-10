import { LinkTabs } from "@/components/ui/tabs";
import { translate, type Language, type MessageKey } from "@/lib/i18n";

/** Tabs shown on a profile. Followers/following are reached from the stats line, not from tabs. */
const tabs = ["highlights", "liked", "comments"] as const;
export type ProfileTab = (typeof tabs)[number] | "following" | "followers";

export function profileTab(value: string | undefined): ProfileTab {
  return [...tabs, "following", "followers"].includes(value as ProfileTab) ? (value as ProfileTab) : "highlights";
}

export function ProfileTabs({
  username,
  active,
  language,
  hidden,
}: {
  username: string;
  active: ProfileTab;
  language: Language;
  hidden: ProfileTab[];
}) {
  return (
    <>
      <LinkTabs
        label="Profile sections"
        className="sticky top-12 z-10 bg-background/90 backdrop-blur md:top-0"
        items={tabs.map((tab) => ({
          href: `/profile/${username}?tab=${tab}`,
          label: translate(language, tab as MessageKey),
          active: active === tab,
        }))}
      />
      {hidden.includes(active) ? <span className="sr-only">{translate(language, "privateTab")}</span> : null}
    </>
  );
}
