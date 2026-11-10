"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-client";
import { formatCount } from "@/lib/video";
import { cn } from "@/lib/utils";

type Totals = { plays: number; viewers?: number; watch_seconds: number; likes: number; comments: number; saves: number };
type Insights = {
  days: number;
  current: Totals;
  previous: Totals;
  daily: Array<{ day: string; plays: number; engagements: number }>;
  lifetime_views: number;
  lifetime_likes: number;
  lifetime_comments: number;
  first_hour: number;
  first_day: number;
  tracking_started: string | null;
};

const ranges = [7, 30, 90] as const;

function watchTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <span className="text-xs text-muted">No change</span>;
  if (before === 0) return <span className="text-xs text-success">New</span>;
  const change = Math.round(((now - before) / before) * 100);
  return (
    <span className={cn("text-xs", change >= 0 ? "text-success" : "text-danger")}>
      {change >= 0 ? "+" : ""}{change}% vs previous
    </span>
  );
}

/** Creator-only analytics for one clip over 7, 30 or 90 days. */
export function InsightsDialog({ open, onClose, clipId, title }: { open: boolean; onClose: () => void; clipId: string; title: string }) {
  const [days, setDays] = useState<(typeof ranges)[number]>(30);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const loading = open && !error && loadedFor !== days;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/clips/${clipId}/insights?days=${days}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setError(await apiErrorMessage(response, "Could not load insights."));
          return;
        }
        setError("");
        setData((await response.json()) as Insights);
        setLoadedFor(days);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("Could not load insights. Check your connection.");
      });
    return () => controller.abort();
  }, [open, clipId, days]);

  const current = data?.current;
  const engagements = current ? current.likes + current.comments + current.saves : 0;
  const maxPlays = Math.max(1, ...(data?.daily.map((item) => item.plays) ?? [1]));
  const maxEngagements = Math.max(1, ...(data?.daily.map((item) => item.engagements) ?? [1]));
  const tiles = current && data
    ? [
        { label: "Plays", value: formatCount(current.plays), delta: <Delta now={current.plays} before={data.previous.plays} /> },
        { label: "Watch time", value: watchTime(current.watch_seconds), delta: <Delta now={current.watch_seconds} before={data.previous.watch_seconds} /> },
        { label: "Avg. watch", value: current.plays ? watchTime(current.watch_seconds / current.plays) : "–", delta: null },
        { label: "Likes", value: formatCount(current.likes), delta: <Delta now={current.likes} before={data.previous.likes} /> },
        { label: "Comments", value: formatCount(current.comments), delta: <Delta now={current.comments} before={data.previous.comments} /> },
        { label: "Saves", value: formatCount(current.saves), delta: <Delta now={current.saves} before={data.previous.saves} /> },
      ]
    : [];

  return (
    <Dialog open={open} onClose={onClose} title="Clip insights" description={title}>
      <div role="radiogroup" aria-label="Time range" className="mb-4 inline-flex rounded-full bg-card p-1">
        {ranges.map((range) => (
          <button
            key={range}
            type="button"
            role="radio"
            aria-checked={days === range}
            onClick={() => setDays(range)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              days === range ? "bg-foreground text-background" : "text-muted hover:text-foreground",
            )}
          >
            {range} days
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">{error}</p> : null}
      {loading && !data ? <Skeleton className="h-48 w-full" /> : null}

      {data && current ? (
        <div className={cn("space-y-5", loading && "opacity-60")} aria-busy={loading}>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl bg-card p-3">
                <dt className="text-xs text-muted">{tile.label}</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums">{tile.value}</dd>
                {tile.delta ? <div>{tile.delta}</div> : null}
              </div>
            ))}
          </dl>

          <section aria-label="Daily plays and engagement">
            <div className="mb-2 flex items-center justify-between text-xs text-muted">
              <span>Daily plays</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-accent" /> Plays</span>
                <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-like" /> Engagement</span>
              </span>
            </div>
            <div
              role="img"
              aria-label={`${current.plays} plays and ${engagements} likes, comments and saves in the last ${data.days} days`}
              className="flex h-28 items-end gap-px"
            >
              {data.daily.map((item) => (
                <div key={item.day} title={`${item.day}: ${item.plays} plays, ${item.engagements} engagements`} className="flex h-full min-w-0 flex-1 items-end gap-px">
                  <div className="w-1/2 rounded-t-sm bg-accent" style={{ height: `${Math.max(item.plays ? 4 : 1, (item.plays / maxPlays) * 100)}%`, opacity: item.plays ? 1 : 0.25 }} />
                  <div className="w-1/2 rounded-t-sm bg-like" style={{ height: `${Math.max(item.engagements ? 4 : 1, (item.engagements / maxEngagements) * 100)}%`, opacity: item.engagements ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{data.daily[0]?.day}</span>
              <span>{data.daily.at(-1)?.day}</span>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 text-sm">
            <p className="rounded-xl border p-3"><span className="block text-xs text-muted">Engagement rate</span><span className="font-semibold">{current.plays ? `${Math.round((engagements / current.plays) * 100)}%` : "–"}</span></p>
            <p className="rounded-xl border p-3"><span className="block text-xs text-muted">First hour / first 24h</span><span className="font-semibold tabular-nums">{data.first_hour} / {data.first_day}</span></p>
            <p className="col-span-2 rounded-xl border p-3"><span className="block text-xs text-muted">All time</span><span className="font-semibold tabular-nums">{formatCount(data.lifetime_views)} views · {formatCount(data.lifetime_likes)} likes · {formatCount(data.lifetime_comments)} comments</span></p>
          </section>

          <p className="text-xs leading-5 text-muted">
            Plays and watch time are counted from when tracking began
            {data.tracking_started ? ` (${new Date(data.tracking_started).toLocaleDateString()})` : ""}, so older periods can show zero. Engagement is likes, comments and saves.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
