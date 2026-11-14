import { Bookmark, Heart, MessageCircle, Play, Share2 } from "lucide-react";

const moments = [
  { label: "Lord Steal", at: "0:12", left: "22%" },
  { label: "Savage", at: "0:31", left: "52%" },
  { label: "Clutch", at: "0:47", left: "80%" },
];

/**
 * Decorative preview of a clip card with tappable moments. It is an illustration of the interface
 * (no real users, clips or numbers), so it is hidden from assistive technology.
 */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-linear-to-br from-purple-500/25 via-pink-500/10 to-amber-400/15 blur-3xl" />

      <div className="float-slow rounded-3xl border bg-card p-3 shadow-2xl shadow-black/30">
        <div
          className="relative aspect-video overflow-hidden rounded-2xl"
          style={{ background: "linear-gradient(135deg, #1a1033 0%, #46206f 38%, #8b2a86 68%, #d9602b 100%)" }}
        >
          <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 30%, rgb(255 255 255 / 0.5), transparent 45%)" }} />
          <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-lg">
            <Play className="ml-0.5 h-7 w-7 fill-current" />
          </div>
          <div className="absolute inset-x-4 bottom-4">
            <div className="relative h-1 rounded-full bg-white/30">
              <div className="h-full w-[52%] rounded-full bg-accent" />
              {moments.map((moment) => (
                <span
                  key={moment.label}
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/40 bg-white"
                  style={{ left: moment.left }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 px-1">
          {moments.map((moment) => (
            <span key={moment.label} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-text">
              {moment.label}
              <span className="tabular-nums text-muted">{moment.at}</span>
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t px-1 pt-3 text-muted">
          <div className="flex items-center gap-4">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Bookmark className="h-5 w-5" />
          </div>
          <Share2 className="h-5 w-5" />
        </div>
      </div>

      <span className="float-slow absolute -right-2 -top-5 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold shadow-lg sm:-right-6" style={{ "--delay": "-2s" } as React.CSSProperties}>
        <span className="brand-gradient-text">Maniac</span>
      </span>
      <span className="float-slow absolute -bottom-5 left-8 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold shadow-lg" style={{ "--delay": "-4s" } as React.CSSProperties}>
        <span className="brand-gradient-text">Triple Kill</span>
      </span>
    </div>
  );
}
