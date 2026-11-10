import { cn } from "@/lib/utils";

/**
 * One width system for every page: a 600px column, optionally with a right
 * rail that only appears on wide screens. Pages decide whether they want a rail
 * so data for it is fetched only where it is shown.
 */
export function PageContainer({
  children,
  rail,
  className,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="mx-auto flex w-full justify-center gap-8 xl:px-6">
      <div className={cn("min-h-dvh w-full max-w-[600px] min-w-0 md:border-x", className)}>{children}</div>
      {rail ? (
        <aside className="sticky top-0 hidden h-dvh w-[300px] shrink-0 overflow-y-auto py-5 pr-1 xl:block no-scrollbar">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}

/**
 * Page header in the Threads-web layout: a 56px bar with the title centered,
 * an optional leading control (back) on the left and actions on the right.
 * It sticks under the mobile top bar so the title stays visible while scrolling.
 */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <header
        className={cn(
          "sticky top-12 z-10 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-background/90 px-3 backdrop-blur md:top-0 md:px-4",
          className,
        )}
      >
        <div className="flex items-center justify-start">{leading}</div>
        <h1 className="max-w-[16rem] truncate text-base font-bold tracking-tight sm:max-w-sm">{title}</h1>
        <div className="flex items-center justify-end gap-1">{actions}</div>
      </header>
      {description ? <p className="px-4 pb-1 pt-3 text-sm leading-5 text-muted">{description}</p> : null}
    </>
  );
}
