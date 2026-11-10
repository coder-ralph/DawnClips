"use client";

import { useEffect } from "react";
import { openUploadModal } from "@/lib/ui-events";

/** Opens the New clip modal once when the /upload page is visited directly. */
export function UploadLauncher() {
  useEffect(() => {
    const timer = window.setTimeout(openUploadModal, 50);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
