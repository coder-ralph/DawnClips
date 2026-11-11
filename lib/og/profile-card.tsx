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
          gap: 64,
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
            <div style={{ display: "flex", flexDirection: "column", width: 652, flexShrink: 0 }}>
              <div style={{ display: "flex", fontSize: 68, lineHeight: 1.1 }}>{clip(card.displayName, 26)}</div>
              <div style={{ display: "flex", marginTop: 12, fontSize: 38, color: "#f3b13a" }}>@{card.username}</div>
              {card.bio ? (
                <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "#cbd5e1" }}>{clip(card.bio, 90)}</div>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 44 }}>
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} width={56} height={56} alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
                ) : null}
                <div style={{ display: "flex", fontSize: 34, color: "#e2e8f0" }}>{siteConfig.name} · MLBB highlights</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} width={220} height={220} alt="" style={{ width: 220, height: 220, borderRadius: 52 }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 104 }}>{siteConfig.name}</div>
              <div style={{ display: "flex", fontSize: 36, color: "#cbd5e1", marginTop: 8 }}>{siteConfig.tagline}</div>
            </div>
          </div>
        )}
      </div>
    ),
    profileCardSize,
  );
}
