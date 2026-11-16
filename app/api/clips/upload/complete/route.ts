import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { deleteObject, publicObjectUrl, readObjectPrefix, r2Configured, statObject } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadCompleteSchema } from "@/lib/validations/clip";
import { clipStorageKeys, isMp4Signature } from "@/lib/video";

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return Response.json({ error: "Video storage is not configured." }, { status: 503 });

  const parsed = uploadCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not found." }, { status: 409 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  // Status, size, type and storage keys can only be changed with the service role (supabase/schema-phase10.sql).
  // Every write below is scoped to the clip id and the verified owner.
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const clip = await supabase
    .from("clips")
    .select("id, status, r2_object_key, thumbnail_object_key, file_size, visibility")
    .eq("id", parsed.data.clipId)
    .eq("user_id", profile.profile.id)
    .maybeSingle();
  if (clip.error || !clip.data || !clip.data.r2_object_key) {
    return Response.json({ error: "Upload not found." }, { status: 404 });
  }
  if (clip.data.status === "published") return Response.json({ id: clip.data.id, status: "published" });
  if (!["pending", "processing"].includes(clip.data.status)) {
    return Response.json({ error: "This upload can no longer be published." }, { status: 409 });
  }
  // The stored video key must be exactly the key derived from this owner and this clip.
  const keys = clipStorageKeys(profile.profile.id, clip.data.id);
  if (!keys || clip.data.r2_object_key !== keys.video) {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const owned = { id: clip.data.id, ownerId: profile.profile.id };

  await admin.from("clips").update({ status: "processing" }).eq("id", owned.id).eq("user_id", owned.ownerId).eq("status", "pending");

  const object = await statObject(keys.video);
  if (!object.exists) {
    await admin.from("clips").update({ status: "pending" }).eq("id", owned.id).eq("user_id", owned.ownerId).eq("status", "processing");
    return Response.json({ error: "The video has not finished uploading." }, { status: 409 });
  }
  if (object.size !== clip.data.file_size || object.contentType !== "video/mp4") {
    await deleteObject(keys.video, owned.ownerId);
    await admin.from("clips").update({ status: "failed" }).eq("id", owned.id).eq("user_id", owned.ownerId);
    return Response.json({ error: "The uploaded file did not match the approved video." }, { status: 400 });
  }

  const prefix = await readObjectPrefix(keys.video);
  if (!isMp4Signature(prefix)) {
    await deleteObject(keys.video, owned.ownerId);
    await admin.from("clips").update({ status: "failed" }).eq("id", owned.id).eq("user_id", owned.ownerId);
    return Response.json({ error: "Only MP4 videos are accepted." }, { status: 400 });
  }

  // The poster is only used when it is the clip's own derived key; anything else is ignored.
  let thumbnailUrl: string | null = null;
  if (parsed.data.posterUploaded && clip.data.thumbnail_object_key === keys.poster) {
    const poster = await statObject(keys.poster);
    if (poster.exists && poster.contentType === "image/jpeg" && clip.data.visibility === "public") {
      thumbnailUrl = publicObjectUrl(keys.poster);
    }
  }

  const published = await admin
    .from("clips")
    .update({ status: "published", thumbnail_url: thumbnailUrl })
    .eq("id", owned.id)
    .eq("user_id", owned.ownerId)
    .eq("status", "processing")
    .select("id")
    .single();
  if (published.error) return Response.json({ error: "Could not publish the clip." }, { status: 500 });
  return Response.json({ id: published.data.id, status: "published" });
}
