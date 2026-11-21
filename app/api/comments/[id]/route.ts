import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { commentImagesOf, deleteMediaEntries } from "@/lib/media-cleanup";
import { ensureCurrentProfile } from "@/lib/profile";
import { callSocial } from "@/lib/social";
import { r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { commentEditSchema } from "@/lib/validations/social";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = commentEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid comment." }, { status: 400 });
  const result = await callSocial("edit_comment", { target: id, body: parsed.data.content });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Comment not found." }, { status: 404 });

  // delete_comment removes the comment and every reply beneath it. Any images attached to them are deleted from R2
  // first, so a storage failure leaves the whole thread in place and the person can try again (nothing is orphaned).
  // Only the author of this comment gets here with work to do; each object is deleted under its own owner's id.
  const profile = await ensureCurrentProfile();
  const admin = createAdminSupabaseClient();
  if (profile.status === "ready" && admin) {
    const own = await admin.from("comments").select("id").eq("id", id).eq("user_id", profile.profile.id).maybeSingle();
    if (own.data) {
      const tree = await admin.rpc("comment_tree_ids", { target: id });
      if (tree.error || !Array.isArray(tree.data)) return Response.json({ error: "Could not delete that comment. Try again." }, { status: 500 });
      const images = await commentImagesOf(admin, tree.data as string[]);
      if (!images.ok) return Response.json({ error: "Could not delete that comment. Try again." }, { status: 500 });
      if (images.entries.length > 0) {
        if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });
        const { failed } = await deleteMediaEntries(images.entries);
        if (failed.length > 0) return Response.json({ error: "Could not delete that comment. Try again." }, { status: 502 });
      }
    }
  }

  // delete_comment checks that the signed-in profile wrote the comment, deletes the thread (and its comment_media rows,
  // by cascade) and returns the clip's new comment count and the removed ids.
  const result = await callSocial<{ deleted: boolean; comments_count: number; removed_ids: string[] }>("delete_comment", { target: id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}
