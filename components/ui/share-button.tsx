"use client";

import { Share } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Native share sheet when available, otherwise copies the link. Feedback goes through toasts. */
export function ShareButton({
  path,
  label = "Share",
  compact = false,
  className,
}: {
  path: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const toast = useToast();

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("Could not share this link", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={compact ? "Share" : undefined}
      className={
        compact
          ? cn("action-btn", className)
          : buttonClasses({ variant: "secondary", size: "sm", className })
      }
    >
      <Share aria-hidden="true" className="h-[18px] w-[18px]" />
      {compact ? null : label}
    </button>
  );
}
