import { cn } from "@/lib/utils";

/** Round avatar with an initial fallback. Decorative: the name is always rendered next to it. */
export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={style}
        className={cn("shrink-0 rounded-full bg-card object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.4)) }}
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full bg-card font-semibold text-accent-text",
        className,
      )}
    >
      {(name.trim().slice(0, 1) || "?").toUpperCase()}
    </span>
  );
}
