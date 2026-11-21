import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { commentImageKey } from "@/lib/media";
import { sweepStaleCommentImages } from "@/lib/media-cleanup";
import { ensureCurrentProfile } from "@/lib/profile";
import { createUploadUrl, r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { commentImageInitiateSchema } from "@/lib/validations/post";

/**
 * Step 1 of a comment image: the browser declares the image, the server records it as 'pending' under a server-generated
 * id and returns one presigned PUT. The key (comment-images/<owner>/<id>.<ext>) is derived here from the signed-in owner.
 * The comment itself is posted afterwards with this id, which is when the server reads the bytes and checks them.
 */
export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });

  const parsed = commentImageInitiateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid image." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile before commenting." }, { status: 409 });
  const ownerId = profile.profile.id;

  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const allowed = await supabase.rpc("consume_rate_limit", { action: "comment_image", max_hits: 20, window_seconds: 3600 });
  if (allowed.error || allowed.data !== true) return Response.json({ error: "Too many images. Try again later." }, { status: 429 });

  await sweepStaleCommentImages(admin, ownerId);

  const waiting = await admin
    .from("comment_media")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .neq("status", "attached");
  if ((waiting.count ?? 0) >= 5) return Response.json({ error: "Post or remove your current images first." }, { status: 429 });

  const id = randomUUID();
  const key = commentImageKey(ownerId, id, parsed.data.mimeType);
  if (!key) return Response.json({ error: "Invalid image." }, { status: 400 });

  const inserted = await admin.from("comment_media").insert({
    id,
    owner_id: ownerId,
    status: "pending",
    mime_type: parsed.data.mimeType,
    file_size: parsed.data.size,
    width: parsed.data.width,
    height: parsed.data.height,
  });
  if (inserted.error) return Response.json({ error: "Could not start the upload." }, { status: 500 });

  const signed = await createUploadUrl(key, parsed.data.mimeType, parsed.data.size);
  return Response.json({ mediaId: id, uploadUrl: signed.url, headers: signed.headers });
}
