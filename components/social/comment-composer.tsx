"use client";

import { ArrowUp, Loader2, Smile } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { emojiGroups } from "@/lib/emoji";
import { insertAtCursor } from "@/lib/text-insert";

/**
 * Comment box with the send button and an emoji picker inside it. The emoji are plain Unicode characters from the
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
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const caret = useRef<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const panelId = useId();
  const canSubmit = value.trim().length > 0 && !pending;

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
      className="rounded-2xl border border-line-strong bg-background transition-colors focus-within:border-accent-text focus-within:outline-2 focus-within:outline-accent-text"
    >
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
        rows={3}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="field-sizing-content block max-h-48 min-h-[4.5rem] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted"
      />

      {emojiOpen ? (
        <div id={panelId} role="group" aria-label="Emoji" className="max-h-44 overflow-y-auto border-t px-2 py-2">
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

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          ref={emojiButton}
          type="button"
          aria-label="Insert emoji"
          aria-expanded={emojiOpen}
          aria-controls={emojiOpen ? panelId : undefined}
          onClick={() => setEmojiOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-text aria-expanded:bg-hover aria-expanded:text-foreground"
        >
          <Smile aria-hidden="true" className="h-5 w-5" />
        </button>
        {onCancel ? <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        {value.length > maxLength - 100 ? (
          <span className="ml-auto pr-1 text-xs tabular-nums text-muted">{value.length}/{maxLength}</span>
        ) : (
          <span className="ml-auto" />
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={submitLabel}
          title={submitLabel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        >
          {pending ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <ArrowUp aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>
    </form>
  );
}
