"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Bare modal on the native <dialog> element (focus trap, Escape, inert page).
 * The caller owns the header and footer, so it can match composer-style layouts.
 * `onRequestClose` fires for Escape and backdrop clicks; the caller decides
 * whether to close, for example after a "Discard?" confirmation.
 */
export function Modal({
  open,
  onRequestClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onRequestClose: () => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={cn("dialog dialog-wide", className)}
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onRequestClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
