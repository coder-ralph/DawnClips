import { cn } from "@/lib/utils";

/** Shared look for text inputs, textareas and selects. */
export const inputClass =
  "w-full rounded-xl border border-line-strong bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted transition-colors hover:border-foreground/50 focus-visible:border-accent-text focus-visible:outline-2 focus-visible:outline-accent-text focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

export function Field({
  label,
  hint,
  counter,
  className,
  children,
}: {
  label: string;
  hint?: string;
  counter?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {counter ? <span className="text-xs tabular-nums text-muted">{counter}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}
