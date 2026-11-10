"use client";

import { openUploadModal } from "@/lib/ui-events";

/** Opens the New clip modal. Rendered by server components, so it takes plain props. */
export function OpenUploadButton({
  className,
  label = "New clip",
  children,
}: {
  className?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} aria-haspopup="dialog" onClick={openUploadModal} className={className}>
      {children}
    </button>
  );
}
