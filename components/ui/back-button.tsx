"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/** Goes back in history when there is any, otherwise falls back to a safe page. */
export function BackButton({ fallbackHref = "/", label = "Back" }: { fallbackHref?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallbackHref))}
      className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-hover"
    >
      <ArrowLeft aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
