import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";
import { loadAvatarDataUri } from "@/lib/og/avatar";

export const profileCardSize = { width: 1200, height: 630 };

async function brandIcon() {
  try {
    const file = await readFile(path.join(process.cwd(), "app", "icon.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * app/icon.png is the full 512px logo on a dark square. The rounded tile itself spans about x 56-456,
 * y 56-456, so the mark is drawn cropped to that area (and rounded) instead of shrinking the whole square,
 * which left the logo small and blurred into the card background.
 */
function BrandMark({ src, size }: { src: string; size: number }) {
  const crop = 400;
  const scale = size / crop;
  return (
    <div style={{ display: "flex", width: size, height: size, flexShrink: 0, overflow: "hidden", borderRadius: Math.round(size * 0.22) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={512 * scale} height={512 * scale} alt="" style={{ width: 512 * scale, height: 512 * scale, marginLeft: -56 * scale, marginTop: -56 * scale, maxWidth: "none" }} />
    </div>
  );
}

const clipsGradient = ["#d946ef", "#e853d2", "#f061b2", "#f67b8f", "#fb923c"];

/** "Dawn" in white and "Clips" fading from magenta to orange, like the logo wordmark (the renderer has no text gradients). */
function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", fontSize: size, lineHeight: 1.1 }}>
      <span style={{ color: "#ffffff" }}>Dawn</span>
      {"Clips".split("").map((letter, index) => (
        <span key={index} style={{ color: clipsGradient[index] }}>{letter}</span>
      ))}
    </div>
  );
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

type Card = { displayName: string; username: string; bio?: string | null; avatarUrl?: string | null };

/**
 * 1200x630 share card for a profile: the picture on the left, name, handle and bio on the right.
 * Without a profile (not found, private, database unavailable) it is the plain DawnClips card.
 */
export async function renderProfileCard(card: Card | null) {
  if (!card) {
    // Nothing to show about a person: serve the plain DawnClips share image.
    try {
      const file = await readFile(path.join(process.cwd(), "public", "og.png"));
      return new Response(new Uint8Array(file), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
    } catch {
      // fall through to the rendered card below
    }
  }
  const [avatar, icon] = await Promise.all([loadAvatarDataUri(card?.avatarUrl), brandIcon()]);
  const initial = (card?.displayName ?? siteConfig.name).trim().charAt(0).toUpperCase() || "D";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #07051a 0%, #1a0b33 55%, #2a0f2e 100%)",
          color: "#f8fafc",
          padding: 72,
          alignItems: "center",
          justifyContent: card ? "flex-start" : "center",
        }}
      >
        {card ? (
          <>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={340} height={340} alt="" style={{ width: 340, height: 340, flexShrink: 0, borderRadius: 340, objectFit: "cover", border: "6px solid #f3b13a" }} />
            ) : (
              <div style={{ display: "flex", width: 340, height: 340, flexShrink: 0, borderRadius: 340, alignItems: "center", justifyContent: "center", background: "#f3b13a", color: "#1a0b33", fontSize: 170, border: "6px solid #fff3d6" }}>
                {initial}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", width: 620, flexShrink: 0, marginLeft: 96 }}>
              <div style={{ display: "flex", fontSize: 68, lineHeight: 1.1 }}>{clip(card.displayName, 26)}</div>
              <div style={{ display: "flex", marginTop: 12, fontSize: 38, color: "#f3b13a" }}>@{card.username}</div>
              {card.bio ? (
                <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "#cbd5e1" }}>{clip(card.bio, 90)}</div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 44 }}>
                {icon ? <BrandMark src={icon} size={88} /> : null}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <Wordmark size={42} />
                  <div style={{ display: "flex", marginTop: 2, fontSize: 26, color: "#cbd5e1" }}>MLBB highlights</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
            {icon ? <BrandMark src={icon} size={260} /> : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Wordmark size={112} />
              <div style={{ display: "flex", fontSize: 36, color: "#cbd5e1", marginTop: 8 }}>{siteConfig.tagline}</div>
            </div>
          </div>
        )}
      </div>
    ),
    profileCardSize,
  );
}
