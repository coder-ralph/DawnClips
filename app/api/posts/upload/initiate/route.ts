import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { splitClipText } from "@/lib/clip-text";
import { postMediaKey } from "@/lib/media";
import { discardPhotoPost, sweepStalePhotoPosts } from "@/lib/media-cleanup";
import { ensureCurrentProfile } from "@/lib/profile";
import { createUploadUrl, r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postInitiateSchema } from "@/lib/validations/post";

/**
 * Step 1 of a photo post. The browser declares each photo (type, size, pixel size); this creates a pending post, one
 * post_media row per photo with a server-generated id, and one presigned PUT URL per photo. The object keys are
 * derived here from the signed-in owner, the new post id and the new image ids; nothing about them comes from the client.
 */
export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });

  const parsed = postInitiateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid post." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile before posting." }, { status: 409 });
  const ownerId = profile.profile.id;

  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  // Posts and their images are written with the service role, like clips: signed-in users cannot insert them or change
  // their status, type or size themselves. Every write below is scoped to the verified owner.
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const allowed = await supabase.rpc("consume_rate_limit", { action: "post_upload", max_hits: 10, window_seconds: 3600 });
  if (allowed.error || allowed.data !== true) {
    return Response.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  }

  // Abandoned posts from earlier attempts are cleaned up (their images deleted) before anything is counted.
  await sweepStalePhotoPosts(admin, ownerId);

  const pending = await supabase
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .in("status", ["pending", "processing"]);
  if ((pending.count ?? 0) >= 3) {
    return Response.json({ error: "Finish or cancel your current uploads first." }, { status: 429 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await supabase
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .gte("created_at", dayAgo);
  if ((recent.count ?? 0) >= 20) {
    return Response.json({ error: "Daily upload quota reached." }, { status: 429 });
  }

  const input = parsed.data;
  const postId = randomUUID();
  const { title, description } = splitClipText(input.caption);
  const total = input.files.reduce((sum, file) => sum + file.size, 0);

  const images = input.files.map((file, position) => {
    const id = randomUUID();
    return { id, position, file, key: postMediaKey(ownerId, postId, id, file.mimeType) };
  });
  if (images.some((image) => !image.key)) return Response.json({ error: "Invalid post." }, { status: 400 });

  const inserted = await admin
    .from("clips")
    .insert({
      id: postId,
      user_id: ownerId,
      kind: "photo",
      title,
      description,
      hero_tags: input.heroTags,
      file_size: total,
      visibility: input.visibility,
      status: "pending",
    })
    .select("id")
    .single();
  if (inserted.error) return Response.json({ error: "Could not start the upload." }, { status: 500 });

  const media = await admin.from("post_media").insert(
    images.map((image) => ({
      id: image.id,
      post_id: postId,
      position: image.position,
      mime_type: image.file.mimeType,
      file_size: image.file.size,
      width: image.file.width,
      height: image.file.height,
    })),
  );
  if (media.error) {
    await discardPhotoPost(admin, ownerId, postId);
    await admin.from("clips").delete().eq("id", postId).eq("user_id", ownerId).eq("kind", "photo").neq("status", "published");
    return Response.json({ error: "Could not start the upload." }, { status: 500 });
  }

  const uploads = await Promise.all(
    images.map(async (image) => {
      const signed = await createUploadUrl(image.key as string, image.file.mimeType, image.file.size);
      return { id: image.id, position: image.position, uploadUrl: signed.url, headers: signed.headers };
    }),
  );
  return Response.json({ postId, uploads });
}
