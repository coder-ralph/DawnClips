import "server-only";

const maxBytes = 3 * 1024 * 1024;

/**
 * Downloads a clip poster (JPEG on the public R2 host) as a data URI for the share card renderer, or null.
 * Only the configured R2 public host is fetched, so a clip row can never make the server request another site.
 */
export async function loadThumbnailDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const base = process.env.R2_PUBLIC_URL;
    if (!base) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== new URL(base).hostname) return null;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type !== "image/jpeg" && type !== "image/png") return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > maxBytes) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
