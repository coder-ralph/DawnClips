import { Skeleton } from "@/components/ui/skeleton";

export function ClipSkeleton() {
  return (
    <div className="border-b px-4 py-4 md:px-5" aria-hidden="true">
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 pt-0.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="col-span-2 mt-3 aspect-video rounded-xl sm:col-span-1 sm:col-start-2" />
        <div className="col-span-2 mt-3 flex gap-4 sm:col-span-1 sm:col-start-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading clips">
      {Array.from({ length: count }, (_, index) => (
        <ClipSkeleton key={index} />
      ))}
    </div>
  );
}
