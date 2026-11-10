"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/video";

export function LikeButton({
  clipId,
  liked,
  count,
  className,
}: {
  clipId: string;
  liked: boolean;
  count: number;
  className?: string;
}) {
  const toast = useToast();
  const [state, setState] = useState({ liked, count });
  const [pending, setPending] = useState(false);
  const [pop, setPop] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !state.liked;
    const previous = state;
    setState({ liked: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    setPop(next);
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        setState(previous);
        toast(await apiErrorMessage(response, "Could not update the like."), "error");
        return;
      }
      const body = (await response.json()) as { liked: boolean; likesCount: number };
      setState({ liked: body.liked, count: body.likesCount });
    } catch {
      setState(previous);
      toast("Could not update the like. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={state.liked}
      onClick={() => void toggle()}
      className={cn("action-btn", state.liked && "text-like hover:text-like", className)}
    >
      <Heart
        aria-hidden="true"
        className={cn("h-[18px] w-[18px]", pop && state.liked && "heart-pop")}
        fill={state.liked ? "currentColor" : "none"}
      />
      <span className="sr-only">{state.liked ? "Unlike" : "Like"}</span>
      <span>{formatCount(state.count)}</span>
    </button>
  );
}
