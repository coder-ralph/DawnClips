"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/** Copyable iframe snippet for Discord, forums and blogs. Only public clips can be embedded. */
export function EmbedDialog({ open, onClose, clipId, title }: { open: boolean; onClose: () => void; clipId: string; title: string }) {
  const toast = useToast();
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const safeTitle = title.replace(/["<>&]/g, "");
  const code = `<iframe src="${origin}/embed/${clipId}" title="${safeTitle}" width="560" height="315" style="border:0;max-width:100%;aspect-ratio:16/9" allow="fullscreen" loading="lazy"></iframe>`;

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch {
      toast("Could not copy. Select the text and copy it manually.", "error");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Embed this clip"
      description="Paste this into a forum, blog or any page that accepts HTML. Discord can unfurl the plain link instead."
      footer={
        <>
          <Button variant="secondary" onClick={() => void copy(`${origin}/clip/${clipId}`, "Link copied")}>Copy link</Button>
          <Button onClick={() => void copy(code, "Embed code copied")}>
            <Copy aria-hidden="true" className="h-4 w-4" /> Copy embed code
          </Button>
        </>
      }
    >
      <label className="sr-only" htmlFor={`embed-${clipId}`}>Embed code</label>
      <textarea
        id={`embed-${clipId}`}
        readOnly
        value={code}
        rows={5}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-none rounded-xl border border-line-strong bg-card p-3 font-mono text-xs leading-5"
      />
    </Dialog>
  );
}
