"use client";

import { useCallback, useState } from "react";
import { ClipCard } from "@/components/feed/clip-card";
import type { FeedClip } from "@/types/clips";

/**
 * A plain list of ClipCards with in-view autoplay (one clip plays at a time).
 * Used by Explore, Saved and profile tabs. `removeOnUnsave` drops a card from
 * the list as soon as it is unsaved (Saved page).
 */
export function ClipList({
  clips: initial,
  removeOnUnsave = false,
  empty,
}: {
  clips: FeedClip[];
  removeOnUnsave?: boolean;
  /** Shown when the list becomes empty after removals. */
  empty?: React.ReactNode;
}) {
  const [clips, setClips] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const hide = useCallback((id: string) => setActiveId((current) => (current === id ? null : current)), []);
  const remove = useCallback((id: string) => setClips((current) => current.filter((clip) => clip.id !== id)), []);
  const savedChange = useCallback(
    (id: string, saved: boolean) => {
      if (removeOnUnsave && !saved) remove(id);
    },
    [removeOnUnsave, remove],
  );

  if (clips.length === 0 && empty) return <>{empty}</>;
  return (
    <div>
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} active={activeId === clip.id} onVisible={setActiveId} onHidden={hide} onRemoved={remove} onSavedChange={savedChange} />
      ))}
    </div>
  );
}
