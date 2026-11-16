import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { deleteObject, r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadCancelSchema } from "@/lib/validations/clip";
import { clipStorageKeys, splitClipKeys } from "@/lib/video";

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = uploadCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not found." }, { status: 409 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

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
    // Only this clip's own objects are deleted, whatever the stored keys say.
    const owner = { id: clip.data.id, ownerId: profile.profile.id };
    const { own, foreign } = splitClipKeys(owner, [clip.data.r2_object_key, clip.data.thumbnail_object_key]);
    const derived = clipStorageKeys(owner.ownerId, owner.id);
    if (foreign.length > 0) console.error(`Upload cancel ${clip.data.id}: ignored ${foreign.length} stored object key(s) that do not belong to the clip.`);
    const keys = foreign.length > 0 && derived ? [derived.video, derived.poster] : own;
    for (const key of keys) {
      const removed = await deleteObject(key, profile.profile.id);
      if (!removed.ok && key === derived?.video) {
        return Response.json({ error: "Could not delete the uploaded video. Try again." }, { status: 502 });
      }
    }
  }

  await admin.from("clips").update({ status: "removed" }).eq("id", clip.data.id).eq("user_id", profile.profile.id).in("status", ["pending", "processing"]);
  return Response.json({ ok: true });
}
