import "server-only";

/** Avatars are Clerk-hosted. Only these hosts are fetched when drawing a share card. */
const allowedHosts = ["img.clerk.com", "images.clerk.dev"];
const maxBytes = 2 * 1024 * 1024;

/**
 * Downloads a profile picture and returns it as a data URI that the image renderer can draw, or null.
 * The renderer only decodes PNG and JPEG, so anything else (or a slow, large or unexpected host) falls
 * back to the initial-letter avatar instead of failing the whole image.
 */
export async function loadAvatarDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) return null;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maxBytes) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
