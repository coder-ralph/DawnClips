import { Film } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DiscoveryRail, DiscoveryRailSkeleton } from "@/components/feed/discovery-rail";
import { Feed } from "@/components/feed/feed";
import { FeedSkeleton } from "@/components/feed/clip-skeleton";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { OpenUploadButton } from "@/components/upload/open-upload-button";
import { siteConfig } from "@/config/site";
import { listFeed } from "@/lib/clips";
import { getShellData } from "@/lib/shell-data";

async function Composer() {
  const { viewer, status } = await getShellData();
  if (status === "signed_out") {
    return (
      <div className="flex items-center justify-between gap-4 border-b px-4 py-4 md:px-5">
        <div className="min-w-0">
          <p className="font-semibold">{siteConfig.name}</p>
          <p className="text-sm text-muted">{siteConfig.tagline}</p>
        </div>
        <Link href="/sign-in" className={buttonClasses({ size: "sm" })}>Log in</Link>
      </div>
    );
  }
  if (!viewer) return null;
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 md:px-5">
      <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={40} />
      <OpenUploadButton label="Share a highlight" className="min-w-0 flex-1 truncate text-left text-[15px] text-muted hover:text-foreground">
        Share your MLBB highlight…
      </OpenUploadButton>
      <OpenUploadButton className={buttonClasses({ size: "sm" })}>Upload</OpenUploadButton>
    </div>
  );
}

async function HomeFeed() {
  const feed = await listFeed("foryou", null);
  if (feed.status === "unconfigured") {
    return <EmptyState icon={Film} title="Feed needs Supabase" body="Apply schema.sql and add the Supabase keys. The feed will not show sample clips." />;
  }
  return (
    <Feed
      initialFeed="foryou"
      initialClips={feed.clips}
      initialCursor={feed.nextCursor}
      composer={
        <Suspense fallback={<div className="h-[69px] border-b" />}>
          <Composer />
        </Suspense>
      }
    />
  );
}

export default function HomePage() {
  return (
    <PageContainer
      rail={
        <Suspense fallback={<DiscoveryRailSkeleton />}>
          <DiscoveryRail />
        </Suspense>
      }
    >
      <Suspense fallback={<FeedSkeleton />}>
        <HomeFeed />
      </Suspense>
    </PageContainer>
  );
}
