import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { deleteObject, publicObjectUrl, readObjectPrefix, r2Configured, statObject } from "@/lib/r2";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadCompleteSchema } from "@/lib/validations/clip";
import { isMp4Signature, isOwnedObjectKey } from "@/lib/video";

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
  if (!isOwnedObjectKey(clip.data.r2_object_key, profile.profile.id)) {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  await supabase.from("clips").update({ status: "processing" }).eq("id", clip.data.id).eq("status", "pending");

  const object = await statObject(clip.data.r2_object_key);
  if (!object.exists) {
    await supabase.from("clips").update({ status: "pending" }).eq("id", clip.data.id).eq("status", "processing");
    return Response.json({ error: "The video has not finished uploading." }, { status: 409 });
  }
  if (object.size !== clip.data.file_size || object.contentType !== "video/mp4") {
    await deleteObject(clip.data.r2_object_key);
    await supabase.from("clips").update({ status: "failed" }).eq("id", clip.data.id);
    return Response.json({ error: "The uploaded file did not match the approved video." }, { status: 400 });
  }

  const prefix = await readObjectPrefix(clip.data.r2_object_key);
  if (!isMp4Signature(prefix)) {
    await deleteObject(clip.data.r2_object_key);
    await supabase.from("clips").update({ status: "failed" }).eq("id", clip.data.id);
    return Response.json({ error: "Only MP4 videos are accepted." }, { status: 400 });
  }

  let thumbnailUrl: string | null = null;
  if (parsed.data.posterUploaded && clip.data.thumbnail_object_key) {
    const poster = await statObject(clip.data.thumbnail_object_key);
    if (poster.exists && poster.contentType === "image/jpeg" && clip.data.visibility === "public") {
      thumbnailUrl = publicObjectUrl(clip.data.thumbnail_object_key);
    }
  }

  const published = await supabase
    .from("clips")
    .update({ status: "published", thumbnail_url: thumbnailUrl })
    .eq("id", clip.data.id)
    .eq("user_id", profile.profile.id)
    .select("id")
    .single();
  if (published.error) return Response.json({ error: "Could not publish the clip." }, { status: 500 });
  return Response.json({ id: published.data.id, status: "published" });
}
