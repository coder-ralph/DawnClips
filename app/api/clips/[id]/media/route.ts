import { auth } from "@clerk/nextjs/server";
import { type MediaRow, signPostImages } from "@/lib/post-media";
import { r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Fresh signed image URLs for a photo post the current viewer may see (the viewer calls this when a URL expires). It uses
 * the same authorisation as video playback: public, unlisted by link, or the owner's own; blocked, private and removed
 * posts are refused. The R2 bucket stays private and the keys are derived from the post's owner and id.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Post not found." }, { status: 404 });
  if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const { userId } = await auth();
  const { data, error } = await admin.rpc("authorize_clip_playback", { target: id, clerk_user_id: userId });
  if (error || !data || typeof data !== "object") return Response.json({ error: "Post not found." }, { status: 404 });
  const row = data as { id?: string; user_id?: string; kind?: string; status?: string; media?: MediaRow[] };
  if (row.status !== "published" || row.kind !== "photo" || !row.user_id || !row.id) {
    return Response.json({ error: "Post not found." }, { status: 404 });
  }
  const media = await signPostImages(row.user_id, row.id, Array.isArray(row.media) ? row.media : []);
  return Response.json({ media }, { headers: { "cache-control": "private, max-age=60" } });
}
