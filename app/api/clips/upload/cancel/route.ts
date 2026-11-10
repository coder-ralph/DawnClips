import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { deleteObject, r2Configured } from "@/lib/r2";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadCancelSchema } from "@/lib/validations/clip";

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = uploadCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not found." }, { status: 409 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const clip = await supabase
    .from("clips")
    .select("id, status, r2_object_key, thumbnail_object_key")
    .eq("id", parsed.data.clipId)
    .eq("user_id", profile.profile.id)
    .maybeSingle();
  if (!clip.data) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (!["pending", "processing"].includes(clip.data.status)) {
    return Response.json({ ok: true });
  }

  if (r2Configured()) {
    if (clip.data.r2_object_key) {
      const removed = await deleteObject(clip.data.r2_object_key);
      if (!removed.ok) return Response.json({ error: "Could not delete the uploaded video. Try again." }, { status: 502 });
    }
    if (clip.data.thumbnail_object_key) await deleteObject(clip.data.thumbnail_object_key);
  }

  await supabase.from("clips").update({ status: "removed" }).eq("id", clip.data.id).eq("user_id", profile.profile.id);
  return Response.json({ ok: true });
}
