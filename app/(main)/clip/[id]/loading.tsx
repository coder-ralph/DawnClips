import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClipLoading() {
  return (
    <PageContainer>
      <div className="flex h-12 items-center border-b px-4">
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-4 px-4 pt-4 md:px-5" role="status" aria-label="Loading clip">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="aspect-video w-full rounded-xl" />
      </div>
    </PageContainer>
  );
}
