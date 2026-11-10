"use client";

import { useSyncExternalStore } from "react";

const MUTED_KEY = "dawnclips:muted";
const MUTED_EVENT = "dawnclips:muted-change";

// Fallback for browsers where localStorage throws (private mode, blocked site data).
let memoryMuted: boolean | null = null;

function readMuted() {
  if (memoryMuted !== null) return memoryMuted;
  try {
    return window.localStorage.getItem(MUTED_KEY) !== "0";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(MUTED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MUTED_EVENT, onChange);
  };
}

/** Whether new playback should start muted. Always `true` on the server so hydration matches. */
export function useMutedPreference() {
  const muted = useSyncExternalStore(subscribe, readMuted, () => true);
  const setMuted = (next: boolean) => {
    memoryMuted = next;
    try {
      window.localStorage.setItem(MUTED_KEY, next ? "1" : "0");
    } catch {
      // Storage can be unavailable (private mode); the in-memory event still updates open players.
    }
    window.dispatchEvent(new Event(MUTED_EVENT));
  };
  return [muted, setMuted] as const;
}
