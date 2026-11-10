import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExploreLoading() {
  return (
    <PageContainer>
      <div className="space-y-4 px-4 pt-5 md:px-5" role="status" aria-label="Loading explore">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-3 pt-3">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="aspect-video rounded-xl" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
