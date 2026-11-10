import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPlaybackUrl, publicObjectUrl, r2Configured } from "@/lib/r2";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

  const clip = data as { object_key?: string; visibility?: string; status?: string; thumbnail_key?: string | null };
  if (clip.status !== "published" || !clip.object_key) {
    return Response.json({ error: "This clip is not ready." }, { status: 409 });
  }

  const poster = clip.thumbnail_key
    ? clip.visibility === "public"
      ? publicObjectUrl(clip.thumbnail_key)
      : (await createPlaybackUrl(clip.thumbnail_key)).url
    : null;

  if (clip.visibility === "public") {
    const stable = publicObjectUrl(clip.object_key);
    if (stable) return Response.json({ url: stable, expiresAt: null, poster });
  }

  const playback = await createPlaybackUrl(clip.object_key);
  return Response.json({ url: playback.url, expiresAt: playback.expiresAt, poster });
}
