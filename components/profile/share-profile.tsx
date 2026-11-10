"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ShareProfile({ username }: { username: string }) {
  const toast = useToast();

  async function share() {
    const url = `${window.location.origin}/profile/${username}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: username, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Profile link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("Could not share this profile", "error");
    }
  }

  return (
    <Button variant="secondary" fullWidth onClick={() => void share()}>
      Share profile
    </Button>
  );
}
