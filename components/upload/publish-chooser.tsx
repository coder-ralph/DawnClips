"use client";

import { Clapperboard, Images } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { OPEN_CLIP_COMPOSER_EVENT, OPEN_PHOTO_COMPOSER_EVENT, OPEN_UPLOAD_EVENT } from "@/lib/ui-events";

/**
 * What the New clip button opens: pick "Post a Clip" (the existing video flow, unchanged) or "Post Photos". Choosing one
 * closes this dialog and opens that composer.
 */
export function PublishChooser() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_UPLOAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_UPLOAD_EVENT, onOpen);
  }, []);

  function choose(event: string) {
    setOpen(false);
    // Let the chooser close first so the composer's dialog takes focus cleanly.
    window.setTimeout(() => window.dispatchEvent(new Event(event)), 0);
  }

  const option =
    "flex w-full items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-left transition-colors hover:bg-hover active:bg-active";

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Create a post" description="What would you like to share?">
      <div className="space-y-2.5">
        <button type="button" onClick={() => choose(OPEN_CLIP_COMPOSER_EVENT)} className={option}>
          <Clapperboard aria-hidden="true" className="h-6 w-6 shrink-0 text-accent-text" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Post a Clip</span>
            <span className="block text-sm text-muted">Upload an MP4 highlight.</span>
          </span>
        </button>
        <button type="button" onClick={() => choose(OPEN_PHOTO_COMPOSER_EVENT)} className={option}>
          <Images aria-hidden="true" className="h-6 w-6 shrink-0 text-accent-text" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Post Photos</span>
            <span className="block text-sm text-muted">Share up to 20 JPEG, PNG or WebP photos.</span>
          </span>
        </button>
      </div>
    </Dialog>
  );
}
