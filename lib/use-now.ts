"use client";

import { useEffect, useState } from "react";

/**
 * Current time in ms, refreshed every second until `until` passes. Returns
 * null before the first tick so server and client markup match.
 */
export function useNow(until: string | null | undefined, enabled = true) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || !until) return;
    const end = new Date(until).getTime();
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= end) window.clearInterval(timer);
    };
    const first = window.setTimeout(tick, 0);
    const timer: number = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [until, enabled]);
  return now;
}
