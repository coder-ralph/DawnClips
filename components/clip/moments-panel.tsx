"use client";

import { Plus, Tags, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { PlayerController } from "@/components/video/video-player";
import { apiErrorMessage } from "@/lib/api-client";
import { momentPresets, parseTimestamp } from "@/lib/clip-text";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/video";
import type { ClipMoment } from "@/types/clips";

/**
 * Timestamp tags ("Savage", "Lord Steal") so viewers can jump to the action.
 * Everyone can tap a moment; the creator can add, rename and remove them.
 */
export function MomentsPanel({
  clipId,
  initial,
  isOwn,
  controller,
}: {
  clipId: string;
  initial: ClipMoment[];
  isOwn: boolean;
  controller: React.RefObject<PlayerController | null>;
}) {
  const toast = useToast();
  const [moments, setMoments] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOwn || window.location.hash !== "#moments") return;
    const timer = window.setTimeout(() => setEditing(true), 0);
    return () => window.clearTimeout(timer);
  }, [isOwn]);

  if (!isOwn && moments.length === 0) return null;

  function useCurrentTime() {
    const seconds = Math.floor(controller.current?.currentTime() ?? 0);
    setTime(formatDuration(seconds));
  }

  function add() {
    const at = parseTimestamp(time);
    if (at === null) return setError("Enter a time like 1:23.");
    if (!label.trim()) return setError("Pick or type a label.");
    if (moments.length >= 8) return setError("You can add up to 8 moments.");
    setError("");
    setMoments((current) =>
      [...current, { id: `new-${current.length}-${at}`, at, label: label.trim().slice(0, 24) }].sort((a, b) => a.at - b.at),
    );
    setTime("");
    setLabel("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/clips/${clipId}/moments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moments: moments.map((item) => ({ at: item.at, label: item.label })) }),
      });
      if (!response.ok) {
        setError(await apiErrorMessage(response, "Could not save moments."));
        return;
      }
      const body = (await response.json()) as { moments?: ClipMoment[] };
      if (body.moments) setMoments(body.moments);
      toast("Moments saved");
      setEditing(false);
    } catch {
      setError("Could not save moments. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="moments" aria-labelledby="moments-title" className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="moments-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Tags aria-hidden="true" className="h-4 w-4 text-muted" /> Moments
        </h2>
        {isOwn && !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{moments.length ? "Edit" : "Tag moments"}</Button>
        ) : null}
      </div>

      {moments.length === 0 && !editing ? (
        <p className="mt-1 text-sm text-muted">Tag the best plays so viewers can jump straight to them.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {moments.map((moment) => (
            <li key={moment.id} className="flex items-center">
              <button
                type="button"
                onClick={() => controller.current?.seek(moment.at)}
                className="inline-flex h-8 items-center gap-2 rounded-full bg-card px-3 text-sm font-medium hover:bg-active"
              >
                <span className="tabular-nums text-accent-text">{formatDuration(moment.at)}</span>
                {moment.label}
              </button>
              {editing ? (
                <button
                  type="button"
                  aria-label={`Remove ${moment.label} at ${formatDuration(moment.at)}`}
                  onClick={() => setMoments((current) => current.filter((item) => item.id !== moment.id))}
                  className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-danger"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-3 space-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs text-muted">Time</span>
              <input
                value={time}
                onChange={(event) => setTime(event.target.value)}
                inputMode="numeric"
                placeholder="0:42"
                aria-label="Moment time, for example 0:42"
                className={cn(inputClass, "mt-1 w-24")}
              />
            </label>
            <Button size="sm" variant="secondary" onClick={useCurrentTime}>Use current time</Button>
          </div>
          <div>
            <p className="text-xs text-muted">Label</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {momentPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={label === preset}
                  onClick={() => setLabel(preset)}
                  className={cn(
                    "h-7 rounded-full border px-2.5 text-xs font-medium",
                    label === preset ? "border-accent-text bg-accent-soft text-accent-text" : "hover:bg-hover",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={24}
              placeholder="Or type your own (24 characters)"
              aria-label="Custom label"
              className={cn(inputClass, "mt-2")}
            />
          </div>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={add}><Plus aria-hidden="true" className="h-4 w-4" /> Add moment</Button>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => { setMoments(initial); setEditing(false); setError(""); }}>Cancel</Button>
            <Button size="sm" loading={saving} onClick={() => void save()}>Save moments</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
