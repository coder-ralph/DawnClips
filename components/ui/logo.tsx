import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[var(--text)]", className)}>
      <Image src="/logo-mark.png" alt="" width={32} height={32} unoptimized aria-hidden="true" className="h-8 w-8 shrink-0" />
      {markOnly ? null : <span className="text-base font-semibold tracking-tight">DawnClips</span>}
    </span>
  );
}
