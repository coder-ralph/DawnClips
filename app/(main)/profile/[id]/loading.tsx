import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <PageContainer>
      <div className="space-y-3 px-4 pb-4 pt-6 md:px-5" role="status" aria-label="Loading profile">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-20 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Skeleton className="h-10 rounded-full" />
          <Skeleton className="h-10 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <Skeleton className="aspect-video rounded-xl" />
        <Skeleton className="aspect-video rounded-xl" />
      </div>
    </PageContainer>
  );
}
