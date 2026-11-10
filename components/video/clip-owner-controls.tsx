"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";

export type CommentsMode = "everyone" | "followers" | "disabled";

export function CommentSettingsDialog({
  open,
  onClose,
  clipId,
  initialMode,
}: {
  open: boolean;
  onClose: () => void;
  clipId: string;
  initialMode: CommentsMode;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<CommentsMode>(initialMode);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentsMode: mode }),
      });
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not update comments."), "error");
        return;
      }
      toast("Comment settings updated");
      onClose();
    } catch {
      toast("Could not update comments. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Who can comment?"
      description="Applies to this clip only. Existing comments stay visible."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={pending} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <Field label="Comments">
        <select value={mode} onChange={(event) => setMode(event.target.value as CommentsMode)} className={inputClass}>
          <option value="everyone">Everyone</option>
          <option value="followers">Followers only</option>
          <option value="disabled">Turned off</option>
        </select>
      </Field>
    </Dialog>
  );
}

export function DeleteClipDialog({
  open,
  onClose,
  clipId,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  clipId: string;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not delete the clip."), "error");
        return;
      }
      toast("Clip deleted");
      onClose();
      onDeleted();
    } catch {
      toast("Could not delete the clip. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete this clip?"
      description="The video, its likes and its comments are removed. This cannot be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep clip</Button>
          <Button variant="dangerSolid" loading={pending} onClick={() => void remove()}>Delete</Button>
        </>
      }
    />
  );
}
