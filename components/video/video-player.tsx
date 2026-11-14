"use client";

import { Loader2, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { getSessionSound, setSessionSound, useMutedPreference } from "@/lib/player-prefs";
import { formatDuration } from "@/lib/video";
import { cn } from "@/lib/utils";

type Playback = { url: string; expiresAt: string | null; poster: string | null };

/** Imperative handle for pages that jump to moments in the clip. */
export type PlayerController = { seek: (seconds: number) => void; currentTime: () => number; stop: () => void };

export const playbackRates = [1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Every mounted player registers here. When one starts playing, all the others are paused,
 * so only one clip is ever playing at a time (scroll, click or keyboard).
 */
const players = new Set<HTMLVideoElement>();

/** Pauses every mounted player (opening the viewer, following a link inside it). Sound settings are left alone. */
export function pauseAllPlayers() {
  for (const video of players) video.pause();
}

/** The element that currently owns the lock-screen / notification media controls. */
let mediaOwner: HTMLVideoElement | null = null;

/** The first frame is painted by loading the file at 0.001s, so a card never shows a black box. */
const previewSource = (url: string) => `${url}#t=0.001`;

/** Listening for sound is only allowed without a gesture once the visitor has interacted with the page. */
function mayPlayWithSound() {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return Boolean(activation?.hasBeenActive);
}

const rateLabel = (rate: number) => `${rate}x`;

/** Vertical volume track (Threads style). Drag, click or use the arrow keys. */
function VerticalVolume({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const track = useRef<HTMLDivElement>(null);

  function fromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return;
    onChange(Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)));
  }

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
      }}
      onKeyDown={(event) => {
        const step = event.key === "ArrowUp" || event.key === "ArrowRight" ? 0.05 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -0.05 : 0;
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        onChange(Math.min(1, Math.max(0, value + step)));
      }}
      className="relative mx-auto h-24 w-6 cursor-pointer touch-none"
    >
      <div className="absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white/30" />
      <div className="absolute bottom-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-accent" style={{ height: `calc((100% - 8px) * ${value})` }} />
      <div
        className="absolute left-1/2 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow"
        style={{ bottom: `calc(4px + (100% - 8px) * ${value})` }}
      />
    </div>
  );
}

export function VideoPlayer({
  clipId,
  title,
  active,
  autoplay,
  poster,
  onPlay,
  onOpen,
  startAt = 0,
  controllerRef,
  variant = "inline",
}: {
  clipId: string;
  title: string;
  active: boolean;
  autoplay: boolean;
  /** Public poster image from the clip row; shown before the playback URL is fetched. */
  poster?: string | null;
  onPlay?: () => void;
  /** When set, clicking the picture opens the viewer at the current playback position. */
  onOpen?: (currentTime: number) => void;
  /** Playback position to restore when this player is mounted in the viewer. */
  startAt?: number;
  controllerRef?: React.Ref<PlayerController>;
  /** "viewer" fills its parent (media viewer); "inline" is a 16:9 card. */
  variant?: "inline" | "viewer";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const counted = useRef(false);
  const pendingSeek = useRef<number | null>(startAt > 0 ? startAt : null);
  const volumeHover = useRef(false);
  const playStamp = useRef<number | null>(null);
  const watchedMs = useRef(0);
  const activeRef = useRef(active);
  const aliveRef = useRef(true);
  const pausedWhileHidden = useRef(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [playing, setPlaying] = useState(false);
  // Only used when the visitor presses Play: the "start with sound" setting. Toggling the speaker never writes it.
  const [preferMuted] = useMutedPreference();
  // Mirrors the element. Which clips start with sound is decided by the shared session setting (see play()).
  const [muted, setMutedState] = useState(true);
  const [volume, setVolume] = useState(() => getSessionSound().volume);
  const [rate, setRate] = useState<number>(1);
  const [menu, setMenu] = useState<"volume" | "speed" | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(false);
  const viewer = variant === "viewer";

  /** Sends how long this play session lasted so creators can see watch time in Insights. */
  function flushWatch() {
    if (playStamp.current !== null) {
      watchedMs.current += performance.now() - playStamp.current;
      playStamp.current = null;
    }
    const seconds = Math.round(watchedMs.current / 1000);
    watchedMs.current = 0;
    if (seconds < 2 || typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon(`/api/clips/${clipId}/watch`, new Blob([JSON.stringify({ seconds })], { type: "application/json" }));
  }

  /** Pauses this player (scrolled away). Sound is a session setting, so nothing is muted here. */
  function pauseNow() {
    videoRef.current?.pause();
    setMenu(null);
    flushWatch();
  }

  // Losing the active spot pauses this player. The element's own events update the UI state.
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      videoRef.current?.pause();
      flushWatch();
    }
    // flushWatch only reads refs and the stable clip id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) setMenu(null);
  }

  // Registers the element. On unmount (closing the viewer, opening another clip, leaving the page) the
  // video is stopped and its file released: a removed <video> element would otherwise keep playing.
  useEffect(() => {
    const video = videoRef.current;
    aliveRef.current = true;
    if (!video) return;
    players.add(video);
    return () => {
      aliveRef.current = false;
      players.delete(video);
      video.pause();
      video.muted = true;
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  // Leaving the screen pauses the clip, even if the parent never reports it.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || viewer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio < 0.2)) {
          const video = videoRef.current;
          if (video && !video.paused) pauseNow();
        }
      },
      { threshold: [0, 0.2] },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // pauseNow only touches refs, setState and the stable clip id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, clipId]);

  // No poster image? Fetch the playback URL shortly before the card scrolls into view so the
  // first video frame can act as the preview.
  const needsPreview = !(playback?.poster ?? poster);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !needsPreview || playback || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void loadSource();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // loadSource only reads state that is current when the observer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPreview, playback, clipId]);

  // Switching tabs, windows or Chrome profiles: a clip playing with sound keeps playing in the background,
  // like any media tab. A silent clip has nothing to listen to, so it pauses and resumes when the tab returns.
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.visibilityState === "hidden") {
        if (!video.paused && video.muted) {
          pausedWhileHidden.current = true;
          video.pause();
          flushWatch();
        }
      } else if (pausedWhileHidden.current) {
        pausedWhileHidden.current = false;
        if (activeRef.current && aliveRef.current) void video.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushWatch);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushWatch);
      window.clearTimeout(hideTimer.current);
      flushWatch();
    };
    // flushWatch only touches refs and the stable clip id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lets the OS and the browser treat this as media: lock-screen and notification controls, and a
  // tab that is not throttled like an idle page when it plays with sound.
  useEffect(() => {
    const video = videoRef.current;
    if (!playing || !video || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    mediaOwner = video;
    try {
      const art = playback?.poster ?? poster;
      session.metadata = new MediaMetadata({
        title,
        artist: "DawnClips",
        artwork: art ? [{ src: art, sizes: "640x360", type: "image/jpeg" }] : [],
      });
      session.playbackState = "playing";
      session.setActionHandler("play", () => void video.play().catch(() => undefined));
      session.setActionHandler("pause", () => video.pause());
    } catch {
      // Media Session is optional; playback works without it.
    }
    return () => {
      if (mediaOwner !== video) return;
      mediaOwner = null;
      try {
        session.playbackState = "paused";
        session.setActionHandler("play", null);
        session.setActionHandler("pause", null);
      } catch {
        // ignore
      }
    };
  }, [playing, title, poster, playback?.poster]);

  // The volume slider opens on hover over the speaker control. On touch devices,
  // tapping the speaker opens it temporarily; hovering keeps it open.
  useEffect(() => {
    if (menu !== "volume") return;
    const timer = window.setTimeout(() => {
      if (!volumeHover.current) setMenu(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [menu, volume]);

  // A viewer is mounted separately from the feed card. Preserve the requested
  // timestamp and apply it as soon as metadata is available.
  useEffect(() => {
    if (!Number.isFinite(startAt) || startAt <= 0) return;
    const video = videoRef.current;
    pendingSeek.current = startAt;
    if (video && video.readyState >= 1) {
      video.currentTime = Math.min(startAt, video.duration || startAt);
      pendingSeek.current = null;
    }
  }, [startAt]);

  // Close the speed / volume popover on an outside press or Escape.
  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      const inside = target instanceof Node && Array.from(containerRef.current?.querySelectorAll("[data-popover]") ?? []).some((node) => node.contains(target));
      if (!inside) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMenu(null);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  function poke() {
    setRecent(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setRecent(false), 2500);
  }

  async function loadSource(force = false) {
    if (playback && !force) return playback;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clips/${clipId}/playback`);
      if (!response.ok) {
        setError("This video cannot be played.");
        return null;
      }
      const next = (await response.json()) as Playback;
      setPlayback(next);
      return next;
    } catch {
      setError("Could not reach the video. Check your connection.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Starts playback. Autoplay (no gesture) always starts muted, except in the viewer, which the
   * visitor opened with a click. A manual play (a click or key press) honours the "start with
   * sound" setting. If the browser refuses sound, it retries muted instead of showing an error.
   */
  async function play(fromGesture = false) {
    setError("");
    const source = await loadSource();
    const video = videoRef.current;
    // The player may have been closed while the playback URL was loading.
    if (!source || !video || !aliveRef.current) return;
    // Scrolled away while the playback URL was loading: stay paused.
    if (!fromGesture && !activeRef.current) return;
    // Set the source directly so playback does not wait for another React render.
    const wanted = previewSource(source.url);
    if (video.getAttribute("src") !== wanted) video.src = wanted;

    // If this viewer was opened from a feed card, wait for metadata and seek
    // before starting playback so it never flashes or plays from the beginning.
    if (pendingSeek.current !== null) {
      if (video.readyState < 1) {
        await new Promise<void>((resolve) => {
          const finish = () => resolve();
          video.addEventListener("loadedmetadata", finish, { once: true });
          video.addEventListener("error", finish, { once: true });
        });
      }
      if (!aliveRef.current) return;
      if (pendingSeek.current !== null && video.readyState >= 1) {
        const target = pendingSeek.current;
        video.currentTime = Math.min(target, video.duration || target);
        pendingSeek.current = null;
      }
    }

    video.playbackRate = rate;
    // Sound follows the speaker the visitor last chose, for every clip and every return to a clip.
    // Before they have chosen: feed autoplay is muted, the viewer (opened with a click) has sound,
    // and a manual play follows the "Start muted" setting.
    const session = getSessionSound();
    const wantsSound = session.on ?? (viewer || (fromGesture && !preferMuted));
    video.volume = session.volume;
    video.muted = !(wantsSound && mayPlayWithSound());
    try {
      await video.play();
    } catch {
      if (!video.muted) {
        video.muted = true;
        try {
          await video.play();
        } catch {
          if (fromGesture) setError("Playback was blocked by the browser. Press play to try again.");
          return;
        }
      } else {
        if (fromGesture) setError("Playback was blocked by the browser. Press play to try again.");
        return;
      }
    }
    if (!aliveRef.current || (!fromGesture && !activeRef.current)) {
      video.pause();
      return;
    }
    setPlaying(true);
    onPlay?.();
    if (!counted.current) {
      counted.current = true;
      void fetch(`/api/clips/${clipId}/view`, { method: "POST" });
    }
  }

  function toggle() {
    if (playing) videoRef.current?.pause();
    else void play(true);
  }

  /** Mutes or unmutes. Only the sound changes: the volume slider is not opened. The choice sticks for the visit. */
  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    let level = getSessionSound().volume;
    if (!next && (level === 0 || video.volume === 0)) level = 1;
    video.muted = next;
    video.volume = level;
    setVolume(level);
    setMutedState(next);
    setSessionSound({ on: !next, volume: level });
  }

  function changeVolume(next: number) {
    const video = videoRef.current;
    setVolume(next);
    if (video) {
      video.volume = next;
      video.muted = next === 0;
      setMutedState(next === 0);
    }
    setSessionSound({ on: next > 0, volume: next });
  }

  function changeRate(next: number) {
    setRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    setMenu(null);
  }

  /** Clicking the picture opens the viewer at this timestamp, or toggles playback. */
  function onSurfaceClick() {
    if (onOpen) {
      onOpen(videoRef.current?.currentTime ?? 0);
      return;
    }
    toggle();
  }

  useImperativeHandle(controllerRef, () => ({
    seek(seconds: number) {
      const video = videoRef.current;
      if (video && video.readyState >= 1) {
        video.currentTime = seconds;
        if (video.paused) void play(true);
        return;
      }
      pendingSeek.current = seconds;
      void play(true);
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
    /** Pause and rewind (used when the viewer is closed). */
    stop() {
      const video = videoRef.current;
      if (video) {
        video.pause();
        if (video.readyState >= 1) video.currentTime = 0;
      }
      setProgress(0);
      setMenu(null);
      flushWatch();
    },
  }));

  useEffect(() => {
    if (!active || !autoplay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.localStorage.getItem("dawnclips:autoplay") === "0") return;
    const timer = window.setTimeout(() => {
      void play(false);
    }, 0);
    return () => window.clearTimeout(timer);
    // Playback starts after the effect so state updates are not synchronous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoplay, clipId]);

  function seekBy(seconds: number) {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + seconds));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    poke();
    switch (event.key) {
      case " ":
      case "k":
        event.preventDefault();
        toggle();
        break;
      case "m":
        toggleMute();
        break;
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const base = muted ? 0 : volume;
        changeVolume(Math.min(1, Math.max(0, Math.round((base + (event.key === "ArrowUp" ? 0.1 : -0.1)) * 100) / 100)));
        setMenu("volume");
        break;
      }
      case "ArrowLeft":
        event.preventDefault();
        seekBy(-5);
        break;
      case "ArrowRight":
        event.preventDefault();
        seekBy(5);
        break;
    }
  }

  const percent = duration ? Math.min(100, (progress / duration) * 100) : 0;
  const showControls = !playing || recent || menu !== null;
  const iconButton =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/15 focus-visible:outline-white";
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={`Video: ${title}`}
      aria-keyshortcuts="Space K M ArrowLeft ArrowRight ArrowUp ArrowDown"
      tabIndex={0}
      data-visible={showControls}
      onKeyDown={onKeyDown}
      onPointerMove={poke}
      onPointerDown={poke}
      className={cn("group relative overflow-hidden bg-black text-white outline-offset-2", viewer ? "h-full w-full" : "rounded-xl")}
    >
      <div className={cn("relative w-full", viewer ? "h-full" : "aspect-video")}>
        <video
          ref={videoRef}
          className={cn("h-full w-full object-contain", onOpen && "cursor-pointer")}
          poster={playback?.poster ?? poster ?? undefined}
          src={playback ? previewSource(playback.url) : undefined}
          playsInline
          muted
          preload={playback ? "metadata" : "none"}
          aria-label={title}
          onClick={onSurfaceClick}
          onPlay={(event) => {
            for (const other of players) {
              if (other !== event.currentTarget && !other.paused) other.pause();
            }
            setPlaying(true);
            playStamp.current = performance.now();
          }}
          onPause={() => {
            setPlaying(false);
            if (playStamp.current !== null) {
              watchedMs.current += performance.now() - playStamp.current;
              playStamp.current = null;
            }
          }}
          onEnded={() => {
            setPlaying(false);
            flushWatch();
          }}
          onVolumeChange={() => {
            const video = videoRef.current;
            if (video) setMutedState(video.muted);
          }}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (video && pendingSeek.current !== null) {
              video.currentTime = Math.min(pendingSeek.current, video.duration || pendingSeek.current);
              pendingSeek.current = null;
            }
          }}
          onTimeUpdate={() => {
            const video = videoRef.current;
            if (video) setProgress(video.currentTime);
          }}
          onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
          onError={() => {
            if (playback?.expiresAt && new Date(playback.expiresAt).getTime() < Date.now()) {
              setPlayback(null);
              void loadSource(true);
              return;
            }
            setError("The video failed to load.");
          }}
        />

        {!playing && !error ? (
          <button
            type="button"
            onClick={() => void play(true)}
            aria-label={loading ? "Loading video" : `Play ${title}`}
            className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform hover:scale-105 focus-visible:outline-white"
          >
            {loading ? <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" /> : <Play aria-hidden="true" className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </button>
        ) : null}

        {error ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-4 text-center">
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={() => void play(true)}
              className="rounded-full border border-white/60 px-4 py-1.5 text-sm font-semibold hover:bg-white/15 focus-visible:outline-white"
            >
              Try again
            </button>
          </div>
        ) : null}

        {/* Thin progress line that stays visible while the controls are hidden. */}
        {!showControls && duration ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 transition-opacity",
            "group-focus-within:opacity-100 group-hover:opacity-100",
            showControls ? "opacity-100" : "opacity-0",
          )}
        >
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle} className={iconButton}>
            {playing ? <Pause aria-hidden="true" className="h-5 w-5" fill="currentColor" /> : <Play aria-hidden="true" className="h-5 w-5" fill="currentColor" />}
          </button>
          <span className="w-[4.5rem] shrink-0 text-xs tabular-nums" aria-hidden="true">
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>
          <input
            aria-label="Playback progress"
            aria-valuetext={`${formatDuration(progress)} of ${formatDuration(duration)}`}
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={progress}
            disabled={!duration}
            onChange={(event) => {
              const next = Number(event.target.value);
              setProgress(next);
              if (videoRef.current) videoRef.current.currentTime = next;
            }}
            style={{ "--fill": `${percent}%` } as React.CSSProperties}
            className="range min-w-0 flex-1"
          />

          {/* Volume: hover over the speaker to reveal the slider; tapping the speaker also opens it. */}
          <div
            data-popover
            className="relative"
            onMouseEnter={() => {
              volumeHover.current = true;
              setMenu("volume");
            }}
            onMouseLeave={() => {
              volumeHover.current = false;
              setMenu((current) => (current === "volume" ? null : current));
            }}
          >
            {menu === "volume" ? (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1">
                <div className="rounded-full bg-neutral-900/95 px-1.5 py-3 shadow-lg ring-1 ring-white/15">
                  <VerticalVolume value={muted ? 0 : volume} onChange={changeVolume} />
                </div>
              </div>
            ) : null}
            <button
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              onClick={toggleMute}
              className={iconButton}
            >
              <VolumeIcon aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {/* Playback speed, 1x to 2x. */}
          <div data-popover className="relative">
            {menu === "speed" ? (
              <div role="radiogroup" aria-label="Playback speed" className="absolute bottom-full right-0 mb-1 w-20 rounded-xl bg-neutral-900/95 p-1 shadow-lg ring-1 ring-white/15">
                {[...playbackRates].reverse().map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={option === rate}
                    onClick={() => changeRate(option)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-lg text-sm tabular-nums hover:bg-white/15 focus-visible:outline-white",
                      option === rate && "font-bold text-accent",
                    )}
                  >
                    {rateLabel(option)}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              aria-label={`Playback speed ${rateLabel(rate)}`}
              aria-haspopup="true"
              aria-expanded={menu === "speed"}
              onClick={() => setMenu((current) => (current === "speed" ? null : "speed"))}
              className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums text-white hover:bg-white/15 focus-visible:outline-white"
            >
              {rateLabel(rate)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
