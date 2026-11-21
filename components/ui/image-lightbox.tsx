"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * A larger view of one image. It is a native modal <dialog>, so Escape closes only this view (the post viewer behind it
 * ignores Escape while a dialog is open), focus stays inside it, and a click outside the image closes it.
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node && !node.open) node.showModal();
    return () => node?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={alt}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-dvh max-w-[100vw] overflow-visible bg-transparent p-0 backdrop:bg-black/85"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        autoFocus
        className="fixed right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block max-h-[92dvh] max-w-[96vw] rounded-lg object-contain" />
    </dialog>
  );
}
