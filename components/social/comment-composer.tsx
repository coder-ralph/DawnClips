"use client";

import { ArrowUp, ImagePlus, Loader2, Smile, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { emojiGroups } from "@/lib/emoji";
import { insertAtCursor } from "@/lib/text-insert";
import { cn } from "@/lib/utils";

export type CommentAttachment = {
  /** Local preview of the chosen image (an object URL). */
  previewUrl: string;
  /** uploading: still being sent to storage; ready: can be posted; failed: could not be uploaded. */
  state: "uploading" | "ready" | "failed";
};

/**
 * Comment box with the send button, a photo button and an emoji picker inside it. One JPEG, PNG or WebP image can be
 * attached: it shows as a small preview with a remove button, and Send waits until it has finished uploading. The emoji are plain Unicode characters from the
 * device's own emoji font (no images, no package), inserted at the caret. Ctrl or Cmd + Enter sends.
 */
export function CommentComposer({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  pending,
  maxLength,
  submitLabel,
  autoFocus,
  onCancel,
  attachment,
  attachmentError,
  onPickImage,
  onRemoveImage,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  pending: boolean;
  maxLength: number;
  submitLabel: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  /** The image attached to this comment, if any. Photo attachments are offered only when onPickImage is given. */
  attachment?: CommentAttachment | null;
  attachmentError?: string;
  onPickImage?: (file: File) => void;
  onRemoveImage?: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const caret = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const panelId = useId();
  const hasImage = attachment?.state === "ready";
  const imageBlocks = attachment?.state === "uploading" || attachment?.state === "failed";
  const canSubmit = (value.trim().length > 0 || hasImage) && !imageBlocks && !pending;

  // The box is one line tall until the text wraps, then grows with it. Past the CSS max height it scrolls inside,
  // without a visible scrollbar.
  const fit = useCallback(() => {
    const node = textarea.current;
    if (!node) return;
    const top = node.scrollTop;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
    node.scrollTop = top;
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [value, fit]);

  // A wider or narrower window re-wraps the text, so the height is measured again.
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  // After an emoji is inserted the caret goes right behind it.
  useEffect(() => {
    const node = textarea.current;
    if (caret.current === null || !node) return;
    node.focus();
    node.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);

  function pick(emoji: string) {
    const node = textarea.current;
    const result = insertAtCursor(value, node?.selectionStart ?? null, node?.selectionEnd ?? null, emoji, maxLength);
    if (!result) return;
    caret.current = result.cursor;
    onChange(result.value);
    setEmojiOpen(false);
  }

  function submit() {
    if (canSubmit) onSubmit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && emojiOpen) {
          // Close the picker only; the viewer behind must not close as well.
          event.preventDefault();
          setEmojiOpen(false);
          emojiButton.current?.focus();
        }
      }}
    >
      {attachment ? (
        <div className="mb-2 flex items-start gap-2" data-testid="comment-attachment">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-card">
            {/* A local preview of the file the person chose. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment.previewUrl} alt="Photo to attach" className={cn("h-full w-full object-cover", attachment.state !== "ready" && "opacity-60")} />
            {attachment.state === "uploading" ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 aria-label="Uploading photo" className="h-5 w-5 animate-spin" />
              </span>
            ) : null}
            {attachment.state === "failed" ? (
              <span className="absolute inset-0 flex items-center justify-center text-danger">
                <TriangleAlert aria-label="Upload failed" className="h-5 w-5" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRemoveImage}
              disabled={pending}
              aria-label="Remove photo"
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      {attachmentError ? (
        <p role="alert" className="mb-2 text-xs text-danger">{attachmentError}</p>
      ) : null}
      {/* One compact row: input, photo button, emoji button and send button. It grows upward only when the text wraps. */}
      <div className="flex items-end gap-0.5 rounded-[22px] border border-line-strong bg-background py-1 pl-4 pr-1 transition-colors focus-within:border-accent-text focus-within:outline-2 focus-within:outline-accent-text">
        <label htmlFor={id} className="sr-only">{label}</label>
        <textarea
          ref={textarea}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit();
            }
          }}
          maxLength={maxLength}
          rows={1}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="no-scrollbar block max-h-[min(16rem,40dvh)] min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-foreground outline-none placeholder:text-muted md:text-[15px]"
        />
        {value.length > maxLength - 100 ? (
          <span className="mb-2 shrink-0 px-1 text-xs tabular-nums text-muted">{value.length}/{maxLength}</span>
        ) : null}
        {onPickImage ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onPickImage(file);
              }}
            />
            <button
              type="button"
              aria-label="Add photo"
              title="Add photo"
              disabled={pending || Boolean(attachment)}
              onClick={() => fileInput.current?.click()}
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ImagePlus aria-hidden="true" className="h-5 w-5" />
            </button>
          </>
        ) : null}
        <button
          ref={emojiButton}
          type="button"
          aria-label="Insert emoji"
          aria-expanded={emojiOpen}
          aria-controls={emojiOpen ? panelId : undefined}
          onClick={() => setEmojiOpen((open) => !open)}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-text aria-expanded:bg-hover aria-expanded:text-foreground"
        >
          <Smile aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={submitLabel}
          title={submitLabel}
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ArrowUp aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>

      {emojiOpen ? (
        <div id={panelId} role="group" aria-label="Emoji" className="mt-2 max-h-44 overflow-y-auto rounded-2xl border bg-background px-2 py-2">
          {emojiGroups.map((group) => (
            <div key={group.id} className="pb-1">
              <p className="px-1 pb-0.5 text-xs font-medium text-muted">{group.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => pick(emoji)}
                    className="flex h-9 w-full items-center justify-center rounded-lg text-xl leading-none hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:outline-accent-text"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {onCancel ? (
        <div className="mt-1 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      ) : null}
    </form>
  );
}
