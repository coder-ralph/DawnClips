"use client";

import { useState } from "react";
import { Button, type ButtonSize } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";

export function FollowButton({
  profileId,
  following,
  onChange,
  size = "md",
  fullWidth,
}: {
  profileId: string;
  following: boolean;
  onChange?: (following: boolean, followersCount: number) => void;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState(following);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !state;
    setState(next);
    setPending(true);
    try {
      const response = await fetch(`/api/profiles/${profileId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        setState(!next);
        toast(await apiErrorMessage(response, "Could not update the follow."), "error");
        return;
      }
      const body = (await response.json().catch(() => null)) as { following?: boolean; followersCount?: number } | null;
      if (!body) {
        setState(!next);
        toast("Could not update the follow.", "error");
        return;
      }
      setState(Boolean(body.following));
      onChange?.(Boolean(body.following), body.followersCount ?? 0);
    } catch {
      setState(!next);
      toast("Could not update the follow. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={state ? "secondary" : "primary"}
      size={size}
      fullWidth={fullWidth}
      loading={pending}
      aria-pressed={state}
      onClick={() => void toggle()}
    >
      {state ? "Following" : "Follow"}
    </Button>
  );
}
