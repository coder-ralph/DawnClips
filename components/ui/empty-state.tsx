import type { LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  body,
  icon: Icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted">
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
      ) : null}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {body ? <p className="mt-2 max-w-sm text-sm leading-6 text-muted">{body}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
