import { listFeed, decodeCursor } from "@/lib/clips";
import { feedQuerySchema } from "@/lib/validations/clip";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = feedQuerySchema.safeParse({
    feed: url.searchParams.get("feed") ?? "foryou",
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Invalid feed request." }, { status: 400 });
  if (parsed.data.cursor && !decodeCursor(parsed.data.cursor)) {
    return Response.json({ error: "Invalid cursor." }, { status: 400 });
  }

  const result = await listFeed(parsed.data.feed, decodeCursor(parsed.data.cursor));
  if (result.status === "unconfigured") {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  if (result.status === "error") return Response.json({ error: "Could not load clips." }, { status: 500 });
  return Response.json({ clips: result.clips, nextCursor: result.nextCursor });
}
