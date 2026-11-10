import { Film, Lock, MessageCircle, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClipList } from "@/components/feed/clip-list";
import { FeedSkeleton } from "@/components/feed/clip-skeleton";
import { ProfileTabs, profileTab, type ProfileTab } from "@/components/profile/profile-tabs";
import { ProfileView } from "@/components/profile/profile-view";
import { UserRow } from "@/components/profile/user-row";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { OpenUploadButton } from "@/components/upload/open-upload-button";
import { siteConfig } from "@/config/site";
import { listProfileFeed } from "@/lib/clips";
import { normalizeLanguage, translate } from "@/lib/i18n";
import { getPublicProfile } from "@/lib/profile";
import { callSocial } from "@/lib/social";
import { formatRelativeTime } from "@/lib/video";

type ActivityRow = {
  id?: string;
  clip_id?: string;
  title?: string;
  content?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  created_at?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getPublicProfile(id);
  if (result.status !== "ready" || !result.profile) {
    return { title: "Profile", robots: { index: false, follow: false } };
  }
  return {
    title: result.profile.displayName,
    description: result.profile.bio || `${result.profile.displayName} on DawnClips`,
    alternates: { canonical: `${siteConfig.url}/profile/${result.profile.username}` },
  };
}

async function ProfileContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = profileTab((await searchParams).tab);
  const result = await getPublicProfile(id);

  if (result.status === "unconfigured") {
    return (
      <EmptyState
        icon={Users}
        title="Profiles need Supabase"
        body="Add the Supabase URL and anon key, then apply schema.sql. This page will not invent a profile."
      />
    );
  }
  if (result.status === "error") return <EmptyState icon={Users} title="Profile unavailable" body={result.message} />;
  if (!result.profile) notFound();
  const profile = result.profile;

  const hidden = [
    !profile.showHighlights && !profile.isOwn ? "highlights" : null,
    !profile.showLikes && !profile.isOwn ? "liked" : null,
    !profile.showComments && !profile.isOwn ? "comments" : null,
    !profile.showFollowing && !profile.isOwn ? "following" : null,
    !profile.showFollowers && !profile.isOwn ? "followers" : null,
  ].filter(Boolean) as ProfileTab[];
  const isHidden = hidden.includes(tab);
  const isClipTab = tab === "highlights" || tab === "liked";

  const [relationship, activity, clips] = await Promise.all([
    callSocial<{ following?: boolean }>("profile_relationship", { target: profile.id }),
    isClipTab || isHidden ? Promise.resolve(null) : callSocial<ActivityRow[]>("profile_activity", { target: profile.id, tab, page_limit: 24 }),
    isClipTab && !isHidden ? listProfileFeed(profile.id, tab, 24) : Promise.resolve(null),
  ]);
  const language = normalizeLanguage((await cookies()).get("dawnclips-language")?.value);
  const rows = activity?.ok ? activity.data ?? [] : [];
  const peopleTab = tab === "followers" || tab === "following";

  return (
    <>
      <ProfileView profile={profile} following={Boolean(relationship.ok && relationship.data?.following)} />
      <ProfileTabs username={profile.username} active={tab} language={language} hidden={hidden} />

      <div role="region" aria-label={translate(language, tab)}>
        {peopleTab ? (
          <p className="border-b px-4 py-2.5 text-sm font-semibold md:px-5">
            {tab === "followers" ? "Followers" : "Following"}
            <Link href={`/profile/${profile.username}`} scroll={false} className="ml-3 font-normal text-accent-text hover:underline">Back to highlights</Link>
          </p>
        ) : null}

        {isHidden ? <EmptyState icon={Lock} title={translate(language, "privateTab")} /> : null}

        {!isHidden && ((clips && !clips.ok) || (activity && !activity.ok)) ? (
          <EmptyState icon={Users} title="Could not load this tab" body="Try again in a moment." />
        ) : null}

        {!isHidden && clips?.ok ? (
          <ClipList
            key={tab}
            clips={clips.clips}
            empty={
              <EmptyState
                icon={Film}
                title={tab === "highlights" ? "No highlights yet" : "No liked clips yet"}
                body={translate(language, "noResults")}
                action={
                  tab === "highlights" && profile.isOwn ? (
                    <OpenUploadButton className={buttonClasses()}>Upload your first clip</OpenUploadButton>
                  ) : undefined
                }
              />
            }
          />
        ) : null}

        {!isHidden && activity?.ok && rows.length === 0 ? (
          <EmptyState icon={tab === "comments" ? MessageCircle : Users} title={translate(language, tab)} body={translate(language, "noResults")} />
        ) : null}

        {!isHidden && tab === "comments" && rows.length > 0 ? (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/clip/${row.clip_id}#comments`} className="block px-4 py-3 transition-colors hover:bg-hover md:px-5">
                  <span className="block truncate text-xs text-muted">
                    On {row.title} · {row.created_at ? <time dateTime={row.created_at} suppressHydrationWarning>{formatRelativeTime(row.created_at)}</time> : null}
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap break-words text-[15px] leading-6">{row.content}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {!isHidden && peopleTab && rows.length > 0 ? (
          <ul className="divide-y">
            {rows.map((row) =>
              row.username ? (
                <li key={row.id ?? row.username}>
                  <UserRow username={row.username} displayName={row.display_name ?? row.username} avatarUrl={row.avatar_url} />
                </li>
              ) : null,
            )}
          </ul>
        ) : null}
      </div>
    </>
  );
}

export default function ProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <PageContainer>
      <Suspense fallback={<FeedSkeleton />}>
        <ProfileContent params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </PageContainer>
  );
}
