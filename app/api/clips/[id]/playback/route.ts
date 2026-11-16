import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildClipPlayback, type AuthorizedClipRow } from "@/lib/clip-playback";
import { r2Configured } from "@/lib/r2";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  if (!r2Configured()) return Response.json({ error: "Video storage is not configured." }, { status: 503 });

  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const { userId } = await auth();
  const { data, error } = await admin.rpc("authorize_clip_playback", {
    target: id,
    clerk_user_id: userId,
  });
  if (error || !data || typeof data !== "object") return Response.json({ error: "Clip not found." }, { status: 404 });

  const clip = data as AuthorizedClipRow;
  if (clip.status !== "published" || !clip.object_key) {
    return Response.json({ error: "This clip is not ready." }, { status: 409 });
  }

  // `?fresh=1` is sent by the player after a URL failed: it signs at the exact current time.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const playback = await buildClipPlayback(clip, { fresh });
  if (!playback) return Response.json({ error: "This clip is not ready." }, { status: 409 });
  // Per viewer and short-lived, so a clip that is made private or deleted stops being served quickly.
  return Response.json(playback, { headers: { "cache-control": fresh ? "no-store" : "private, max-age=60" } });
}
