import { Bookmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { ClipList } from "@/components/feed/clip-list";
import { FeedSkeleton } from "@/components/feed/clip-skeleton";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { listSavedClips } from "@/lib/clips";

export const metadata: Metadata = {
  title: "Saved",
  robots: { index: false, follow: false },
};

const empty = (
  <EmptyState
    icon={Bookmark}
    title="No saved clips"
    body="Tap the bookmark on any highlight and it will wait for you here."
    action={<Link href="/explore" className={buttonClasses({ variant: "secondary" })}>Explore clips</Link>}
  />
);

async function SavedClips() {
  await auth.protect();
  const result = await listSavedClips(30);
  if (!result.ok) return <p role="alert" className="px-4 py-6 text-sm text-danger md:px-5">Could not load saved clips.</p>;
  // Clips play right here in the list; the ⋯ menu has Unsave, which removes the card.
  return <ClipList clips={result.clips} removeOnUnsave empty={empty} />;
}

export default function SavedPage() {
  return (
    <PageContainer>
      <PageHeader title="Saved" />
      <Suspense fallback={<FeedSkeleton />}>
        <SavedClips />
      </Suspense>
    </PageContainer>
  );
}
