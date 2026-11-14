import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";
import { tagLabel } from "@/lib/heroes";
import { loadAvatarDataUri } from "@/lib/og/avatar";
import { BrandMark, Wordmark, brandIcon } from "@/lib/og/profile-card";
import { loadThumbnailDataUri } from "@/lib/og/thumbnail";
import { formatCount, formatDuration } from "@/lib/video";

export const clipCardSize = { width: 1200, height: 630 };

export type ClipCardData = {
  title: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  thumbnailUrl: string | null;
  heroTags: string[];
  duration: number | null;
  viewsCount: number;
};

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Larger type for short titles, smaller for long ones, so a title never overflows its column. */
function titleSize(title: string) {
  if (title.length <= 36) return 58;
  if (title.length <= 70) return 48;
  return 40;
}

const host = (() => {
  try {
    return new URL(siteConfig.url).host;
  } catch {
    return "dawnclips.vercel.app";
  }
})();

async function plainCard() {
  try {
    const file = await readFile(path.join(process.cwd(), "public", "og.png"));
    return new Response(new Uint8Array(file), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
  } catch {
    return null;
  }
}

/**
 * 1200x630 share card for a public clip: the poster in a framed player on the right, and on the left the
 * logo, the title, who posted it and the heroes. Important content stays about 56px from every edge because
 * Facebook and Messenger crop the top and bottom a little. Without a clip (private, unlisted, missing) it is
 * the plain DawnClips image, so nothing about a hidden clip leaks.
 */
export async function renderClipCard(card: ClipCardData | null) {
  if (!card) {
    const plain = await plainCard();
    if (plain) return plain;
  }
  const [thumbnail, avatar, icon] = await Promise.all([
    loadThumbnailDataUri(card?.thumbnailUrl),
    loadAvatarDataUri(card?.avatarUrl),
    brandIcon(),
  ]);
  const title = cut((card?.title ?? siteConfig.name).trim(), 110);
  const initial = (card?.displayName ?? siteConfig.name).trim().charAt(0).toUpperCase() || "D";
  const tags = (card?.heroTags ?? []).slice(0, 3).map(tagLabel);
  const meta = card ? `${formatCount(card.viewsCount)} ${card.viewsCount === 1 ? "view" : "views"}` : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          background: "linear-gradient(135deg, #07051a 0%, #1a0b33 55%, #2a0f2e 100%)",
          color: "#f8fafc",
        }}
      >
        {thumbnail ? (
          <>
            {/* Poster, enlarged and heavily darkened, as a backdrop that picks up the clip's colours. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 1200,
                height: 630,
                background: "linear-gradient(90deg, rgba(7,5,26,0.97) 0%, rgba(7,5,26,0.92) 50%, rgba(18,8,40,0.80) 100%)",
              }}
            />
          </>
        ) : null}

        {/* Left: brand, title, creator, heroes. */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 536, height: 630, padding: "64px 0 64px 64px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {icon ? <BrandMark src={icon} size={52} /> : null}
            <div style={{ display: "flex", marginLeft: icon ? 16 : 0 }}>
              <Wordmark size={34} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: titleSize(title), lineHeight: 1.18, color: "#ffffff", wordBreak: "break-word" }}>{title}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={52} height={52} style={{ width: 52, height: 52, borderRadius: 26, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: 26, background: "#e0a84a", color: "#1b1204", fontSize: 26 }}>
                  {initial}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                <div style={{ display: "flex", fontSize: 26, color: "#f8fafc" }}>{cut(card?.displayName ?? siteConfig.name, 26)}</div>
                <div style={{ display: "flex", fontSize: 22, color: "#a5a3c4" }}>{card ? `@${cut(card.username, 24)}` : siteConfig.tagline}</div>
              </div>
            </div>
            {tags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: 22, width: 472 }}>
                {tags.map((tag) => (
                  <div
                    key={tag}
                    style={{
                      display: "flex",
                      flexShrink: 0,
                      marginRight: 10,
                      marginBottom: 8,
                      paddingTop: 5,
                      paddingBottom: 5,
                      paddingLeft: 15,
                      paddingRight: 15,
                      borderRadius: 999,
                      background: "rgba(224,168,74,0.16)",
                      border: "1px solid rgba(224,168,74,0.5)",
                      color: "#f3c776",
                      fontSize: 19,
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cut(tag, 16)}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: the framed poster with a play button. */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", width: 664, height: 630, paddingLeft: 24 }}>
          <div
            style={{
              display: "flex",
              position: "relative",
              width: 576,
              height: 324,
              borderRadius: 28,
              overflow: "hidden",
              background: "linear-gradient(135deg, #2a1450 0%, #4a1d5c 100%)",
              border: "3px solid rgba(255,255,255,0.22)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
            }}
          >
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt="" width={576} height={324} style={{ position: "absolute", top: 0, left: 0, width: 576, height: 324, objectFit: "cover" }} />
            ) : null}
            <div style={{ position: "absolute", top: 0, left: 0, width: 576, height: 324, background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
            <div style={{ position: "absolute", top: 112, left: 242, display: "flex", alignItems: "center", justifyContent: "center", width: 92, height: 92, borderRadius: 46, background: "rgba(7,5,26,0.72)", border: "3px solid rgba(255,255,255,0.9)" }}>
              <svg width="38" height="38" viewBox="0 0 24 24" style={{ marginLeft: 5 }}>
                <path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z" fill="#ffffff" />
              </svg>
            </div>
            {card?.duration ? (
              <div style={{ position: "absolute", right: 16, bottom: 14, display: "flex", padding: "4px 12px", borderRadius: 10, background: "rgba(7,5,26,0.82)", color: "#ffffff", fontSize: 22 }}>
                {formatDuration(card.duration)}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", width: 576, marginTop: 22, fontSize: 22, color: "#a5a3c4" }}>
            <div style={{ display: "flex" }}>{card ? meta : siteConfig.description}</div>
            <div style={{ display: "flex", color: "#f3c776" }}>{host}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...clipCardSize,
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
