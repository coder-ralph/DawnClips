import { cn } from "@/lib/utils";

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[var(--text)]", className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="8" fill="#151B29" />
        <path d="M6 20.5c4.2-1.2 7.2-4.8 10-9.5 2.8 4.7 5.8 8.3 10 9.5" fill="none" stroke="#E0A84A" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M13 18.5v-5.2l3-1.8 3 1.8v5.2l-3 1.7-3-1.7z" fill="#E0A84A" />
      </svg>
      {markOnly ? null : <span className="text-base font-semibold tracking-tight">DawnClips</span>}
    </span>
  );
}
