import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { discardUnattachedCommentImage } from "@/lib/media-cleanup";
import { verifyUploadedImage, withSignedCommentImage } from "@/lib/post-media";
import { commentImageKey } from "@/lib/media";
import { ensureCurrentProfile } from "@/lib/profile";
import { callSocial } from "@/lib/social";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { commentBodySchema } from "@/lib/validations/social";

type CommentRow = { user_id: string; media?: { id: string; width: number; height: number; mime_type: string } | null };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await callSocial<CommentRow[]>("list_comments", { target: id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  // Images are private in R2: each one is signed here, after list_comments has applied who may see this clip's comments.
  const comments = await Promise.all((result.data ?? []).map((comment) => withSignedCommentImage(comment)));
  return Response.json({ comments });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = commentBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid comment." }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const allowed = await supabase?.rpc("consume_rate_limit", { action: "comment", max_hits: 20, window_seconds: 60 });
  if (allowed && allowed.data !== true) return Response.json({ error: "Too many comments. Slow down." }, { status: 429 });

  if (!parsed.data.mediaId) {
    const result = await callSocial("add_comment", {
      target: id,
      parent: parsed.data.parentId ?? null,
      body: parsed.data.content,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.data);
  }

  // A comment with an image. The image was uploaded first; before it can be attached the server reads the uploaded
  // object and checks it against what was declared. A comment that cannot be posted never keeps its image.
  const mediaId = parsed.data.mediaId;
  if (!z.string().uuid().safeParse(mediaId).success) return Response.json({ error: "Invalid image." }, { status: 400 });
  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile before commenting." }, { status: 409 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });
  const ownerId = profile.profile.id;

  const row = await admin
    .from("comment_media")
    .select("id, mime_type, file_size, width, height, status")
    .eq("id", mediaId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (row.error || !row.data || row.data.status === "attached") {
    return Response.json({ error: "That image could not be attached. Add it again." }, { status: 400 });
  }

  const key = commentImageKey(ownerId, mediaId, row.data.mime_type);
  if (!key) return Response.json({ error: "That image could not be attached. Add it again." }, { status: 400 });

  let verdict: Awaited<ReturnType<typeof verifyUploadedImage>>;
  try {
    verdict = await verifyUploadedImage(key, {
      mime: row.data.mime_type as string,
      size: Number(row.data.file_size),
      width: row.data.width as number,
      height: row.data.height as number,
    });
  } catch {
    return Response.json({ error: "Could not check the image. Try again." }, { status: 502 });
  }
  if (!verdict.ok) {
    if (verdict.reason === "missing") return Response.json({ error: "The image has not finished uploading." }, { status: 409 });
    await discardUnattachedCommentImage(admin, ownerId, mediaId);
    return Response.json({ error: "That image could not be used. Choose a JPEG, PNG or WebP under 5 MB." }, { status: 400 });
  }

  const verified = await admin
    .from("comment_media")
    .update({ status: "verified" })
    .eq("id", mediaId)
    .eq("owner_id", ownerId)
    .neq("status", "attached");
  if (verified.error) return Response.json({ error: "Could not post the comment." }, { status: 500 });

  const result = await callSocial<CommentRow & Record<string, unknown>>("add_comment_with_media", {
    target: id,
    parent: parsed.data.parentId ?? null,
    body: parsed.data.content,
    media: mediaId,
  });
  if (!result.ok) {
    // Not posted (not allowed, rate, comment missing...): the image goes too, and the person adds it again on retry.
    await discardUnattachedCommentImage(admin, ownerId, mediaId);
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(await withSignedCommentImage(result.data));
}
