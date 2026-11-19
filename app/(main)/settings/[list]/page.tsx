import { auth } from "@clerk/nextjs/server";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RelationshipList } from "@/components/settings/relationship-list";
import { BackButton } from "@/components/ui/back-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRelationshipProfiles } from "@/lib/people";
import { isRelationshipListKind, relationshipLists } from "@/lib/relationships";

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const { list } = await params;
  return { title: isRelationshipListKind(list) ? relationshipLists[list].title : "Settings", robots: { index: false, follow: false } };
}

/** /settings/blocked, /settings/restricted and /settings/muted: the signed-in person's own list. */
async function ListContent({ params }: { params: Promise<{ list: string }> }) {
  const { list } = await params;
  if (!isRelationshipListKind(list)) notFound();
  await auth.protect();
  const result = await fetchRelationshipProfiles(list, null);
  const config = relationshipLists[list];

  return (
    <>
      <PageHeader title={config.title} leading={<BackButton fallbackHref="/settings" />} description={config.explainer} />
      <div className="mt-2 border-t">
        {result.ok ? (
          <RelationshipList kind={list} initial={result.page} />
        ) : (
          <EmptyState icon={Users} title="Could not load this list" body="Try again in a moment." />
        )}
      </div>
    </>
  );
}

export default function RelationshipListPage(props: { params: Promise<{ list: string }> }) {
  return (
    <PageContainer>
      <Suspense
        fallback={
          <div className="space-y-3 px-4 pt-5 md:px-5" role="status" aria-label="Loading">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        }
      >
        <ListContent params={props.params} />
      </Suspense>
    </PageContainer>
  );
}
