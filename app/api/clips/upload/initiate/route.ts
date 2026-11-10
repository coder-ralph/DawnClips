import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { createUploadUrl, deleteObject, r2Configured } from "@/lib/r2";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadInitiateSchema } from "@/lib/validations/clip";
import { clipObjectKey } from "@/lib/video";

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return Response.json({ error: "Video storage is not configured." }, { status: 503 });

  const parsed = uploadInitiateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload." }, { status: 400 });
  if (!parsed.data.fileName.toLowerCase().endsWith(".mp4")) {
    return Response.json({ error: "Only MP4 videos are accepted." }, { status: 400 });
  }

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile before uploading." }, { status: 409 });

  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const allowed = await supabase.rpc("consume_rate_limit", {
    action: "clip_upload",
    max_hits: 10,
    window_seconds: 3600,
  });
  if (allowed.error || allowed.data !== true) {
    return Response.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  }

  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const stale = await supabase
    .from("clips")
    .select("id, r2_object_key, thumbnail_object_key")
    .eq("user_id", profile.profile.id)
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);
  for (const clip of stale.data ?? []) {
    if (clip.r2_object_key) await deleteObject(clip.r2_object_key);
    if (clip.thumbnail_object_key) await deleteObject(clip.thumbnail_object_key);
    await supabase.from("clips").update({ status: "failed" }).eq("id", clip.id).eq("user_id", profile.profile.id);
  }

  const pending = await supabase
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.profile.id)
    .in("status", ["pending", "processing"]);
  if ((pending.count ?? 0) >= 3) {
    return Response.json({ error: "Finish or cancel your current uploads first." }, { status: 429 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await supabase
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.profile.id)
    .gte("created_at", dayAgo);
  if ((recent.count ?? 0) >= 20) {
    return Response.json({ error: "Daily upload quota reached." }, { status: 429 });
  }

  const clipId = randomUUID();
  const objectKey = clipObjectKey(profile.profile.id, clipId, "mp4");
  const posterKey = parsed.data.posterSize ? clipObjectKey(profile.profile.id, clipId, "jpg") : null;
  const input = parsed.data;
  const inserted = await supabase.from("clips").insert({
    id: clipId,
    user_id: profile.profile.id,
    title: input.title,
    description: input.description,
    r2_object_key: objectKey,
    thumbnail_object_key: posterKey,
    hero_tags: input.heroTags,
    file_size: input.fileSize,
    mime_type: input.mimeType,
    visibility: input.visibility,
    status: "pending",
  }).select("id").single();

  if (inserted.error) return Response.json({ error: "Could not start the upload." }, { status: 500 });

  const video = await createUploadUrl(objectKey, "video/mp4", input.fileSize);
  const poster = posterKey && input.posterSize
    ? await createUploadUrl(posterKey, "image/jpeg", input.posterSize)
    : null;

  return Response.json({
    clipId,
    uploadUrl: video.url,
    headers: video.headers,
    posterUploadUrl: poster?.url ?? null,
    posterHeaders: poster?.headers ?? null,
  });
}
