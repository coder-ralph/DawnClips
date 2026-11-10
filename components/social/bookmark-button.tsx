"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function BookmarkButton({
  clipId,
  saved,
  className,
  onSavedChange,
}: {
  clipId: string;
  saved: boolean;
  className?: string;
  /** When provided, `saved` is controlled by the parent so other controls (the ⋯ menu) stay in sync. */
  onSavedChange?: (saved: boolean) => void;
}) {
  const toast = useToast();
  const [internal, setInternal] = useState(saved);
  const state = onSavedChange ? saved : internal;
  const setState = (value: boolean) => {
    setInternal(value);
    onSavedChange?.(value);
  };
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !state;
    setState(next);
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}/bookmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        setState(!next);
        toast(await apiErrorMessage(response, "Could not update the bookmark."), "error");
        return;
      }
      toast(next ? "Saved to your bookmarks" : "Removed from your bookmarks");
    } catch {
      setState(!next);
      toast("Could not update the bookmark. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={state}
      onClick={() => void toggle()}
      className={cn("action-btn", state && "text-accent-text hover:text-accent-text", className)}
    >
      <Bookmark aria-hidden="true" className="h-[18px] w-[18px]" fill={state ? "currentColor" : "none"} />
      <span className="sr-only">{state ? "Remove bookmark" : "Save clip"}</span>
    </button>
  );
}
