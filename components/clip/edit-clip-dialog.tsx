"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { HeroCombobox } from "@/components/upload/hero-combobox";
import { apiErrorMessage } from "@/lib/api-client";
import { CLIP_TEXT_MAX, editWindowMs, formatCountdown, joinClipText, splitClipText } from "@/lib/clip-text";
import { useNow } from "@/lib/use-now";

export type ClipPatch = { title: string; description: string; heroTags: string[]; editedAt: string };

/**
 * Edit a clip's text and hero tags within 15 minutes of publishing. Likes,
 * comments, views and the video itself are untouched. The database enforces
 * the window, so this countdown is only a convenience.
 */
export function EditClipDialog({
  open,
  onClose,
  clipId,
  title,
  description,
  heroTags,
  editableUntil,
  onEdited,
}: {
  open: boolean;
  onClose: () => void;
  clipId: string;
  title: string;
  description: string;
  heroTags: string[];
  editableUntil: string | null;
  onEdited: (patch: ClipPatch) => void;
}) {
  const toast = useToast();
  const labelId = useId();
  const initialText = joinClipText(title, description);
  const [text, setText] = useState(initialText);
  const [tags, setTags] = useState(heroTags);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const now = useNow(editableUntil, open);
  const left = now === null ? null : editWindowMs(editableUntil, now);
  const expired = left === 0;
  const split = splitClipText(text);
  const dirty = text.trim() !== initialText.trim() || tags.join() !== heroTags.join();

  // Start from the latest saved text each time the dialog opens (state reset during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText(initialText);
      setTags(heroTags);
      setError("");
    }
  }

  function requestClose() {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  }

  async function save() {
    if (!split.title) {
      setError("A clip needs a headline.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/clips/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: split.title, description: split.description, heroTags: tags }),
      });
      if (!response.ok) {
        setError(await apiErrorMessage(response, "Could not save your changes."));
        return;
      }
      const body = (await response.json()) as { edited_at?: string | null };
      toast("Clip updated");
      onEdited({
        title: split.title,
        description: split.description,
        heroTags: tags,
        editedAt: body.edited_at ?? new Date().toISOString(),
      });
      onClose();
    } catch {
      setError("Could not save your changes. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Modal open={open} onRequestClose={requestClose} labelledBy={labelId}>
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
          <div>
            <button type="button" onClick={requestClose} className="rounded-full px-3 py-2 text-[15px] hover:bg-hover">Cancel</button>
          </div>
          <h2 id={labelId} className="text-base font-bold">Edit clip</h2>
          <div />
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className={expired ? "text-sm text-danger" : "text-sm text-muted"} role={expired ? "alert" : undefined}>
            {expired
              ? "The 15-minute edit window has closed."
              : left === null
                ? "You can edit for 15 minutes after posting."
                : `You can edit for 15 minutes after posting. Time left: ${formatCountdown(left)}.`}
          </p>
          <div>
            <label htmlFor={`${labelId}-text`} className="sr-only">Caption</label>
            <textarea
              id={`${labelId}-text`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={CLIP_TEXT_MAX}
              rows={3}
              disabled={expired}
              className="block min-h-20 w-full resize-none bg-transparent text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted"
              placeholder="First line is the headline"
              autoFocus
            />
          </div>
          <HeroCombobox selected={tags} onChange={setTags} disabled={expired} />
          {error ? <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">{error}</p> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted">Likes, comments and views stay the same.</p>
          <Button onClick={() => void save()} loading={pending} disabled={!dirty || !split.title || expired}>Done</Button>
        </footer>
      </Modal>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard edit?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button
              variant="dangerSolid"
              onClick={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </>
        }
      />
    </>
  );
}
