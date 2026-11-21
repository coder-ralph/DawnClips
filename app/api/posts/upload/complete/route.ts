import { auth } from "@clerk/nextjs/server";
import { postMediaKeys } from "@/lib/media";
import { discardPhotoPost } from "@/lib/media-cleanup";
import { verifyUploadedImage } from "@/lib/post-media";
import { ensureCurrentProfile } from "@/lib/profile";
import { r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postUploadCompleteSchema } from "@/lib/validations/post";

type Row = { id: string; position: number; mime_type: string; file_size: number; width: number; height: number };

/**
 * Step 3 of a photo post, after the browser has uploaded every photo. Each object is checked against what was declared
 * (it exists, has the declared size and type, and its own bytes are a JPEG, PNG or WebP of the declared pixel size). The post
 * is published only when every photo passes; one bad photo discards the whole post and deletes everything uploaded for it.
 */
export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });

  const parsed = postUploadCompleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not found." }, { status: 409 });
  const ownerId = profile.profile.id;
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const post = await supabase
    .from("clips")
    .select("id, status, kind")
    .eq("id", parsed.data.postId)
    .eq("user_id", ownerId)
    .eq("kind", "photo")
    .maybeSingle();
  if (post.error || !post.data) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (post.data.status === "published") return Response.json({ id: post.data.id, status: "published" });
  if (!["pending", "processing"].includes(post.data.status)) {
    return Response.json({ error: "This upload can no longer be published." }, { status: 409 });
  }
  const postId = post.data.id as string;

  await admin.from("clips").update({ status: "processing" }).eq("id", postId).eq("user_id", ownerId).eq("status", "pending");

  const rows = await admin
    .from("post_media")
    .select("id, position, mime_type, file_size, width, height")
    .eq("post_id", postId)
    .order("position");
  const media = (rows.data ?? []) as Row[];
  if (rows.error || media.length === 0) {
    await discardPhotoPost(admin, ownerId, postId);
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  // Keys are derived from the owner, the post and each image id: never read from storage or from the request.
  const { keys, invalid } = postMediaKeys(ownerId, postId, media.map((row) => ({ id: row.id, mimeType: row.mime_type })));
  if (invalid > 0) {
    await discardPhotoPost(admin, ownerId, postId);
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const keyById = new Map(keys.map((entry) => [entry.id, entry.key]));

  let missing = false;
  let rejected: string | null = null;
  for (let index = 0; index < media.length && !rejected; index += 5) {
    const results = await Promise.all(
      media.slice(index, index + 5).map((row) =>
        verifyUploadedImage(keyById.get(row.id) as string, { mime: row.mime_type, size: row.file_size, width: row.width, height: row.height }),
      ),
    );
    for (const result of results) {
      if (result.ok) continue;
      if (result.reason === "missing") missing = true;
      else rejected = result.reason === "invalid" ? "One of the files is not a valid JPEG, PNG or WebP image." : "One of the uploaded files did not match the approved photo.";
    }
  }

  if (rejected) {
    await discardPhotoPost(admin, ownerId, postId);
    return Response.json({ error: rejected }, { status: 400 });
  }
  if (missing) {
    await admin.from("clips").update({ status: "pending" }).eq("id", postId).eq("user_id", ownerId).eq("status", "processing");
    return Response.json({ error: "The photos have not finished uploading." }, { status: 409 });
  }

  const published = await admin
    .from("clips")
    .update({ status: "published" })
    .eq("id", postId)
    .eq("user_id", ownerId)
    .eq("kind", "photo")
    .eq("status", "processing")
    .select("id")
    .single();
  if (published.error) return Response.json({ error: "Could not publish the post." }, { status: 500 });
  return Response.json({ id: published.data.id, status: "published" });
}
