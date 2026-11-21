import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { commentImageKey } from "@/lib/media";
import { deleteMediaEntries } from "@/lib/media-cleanup";
import { ensureCurrentProfile } from "@/lib/profile";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Removes an image that was uploaded for a comment but not posted (the person removed it from the composer or closed it).
 * Only the uploader can do this, and never for an image that is already part of a comment (deleting the comment does that).
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Image not found." }, { status: 404 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile first." }, { status: 409 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const found = await admin
    .from("comment_media")
    .select("id, mime_type, status")
    .eq("id", id)
    .eq("owner_id", profile.profile.id)
    .maybeSingle();
  if (found.error) return Response.json({ error: "Could not remove that image." }, { status: 500 });
  if (!found.data) return Response.json({ ok: true });
  if (found.data.status === "attached") return Response.json({ error: "That image is part of a comment." }, { status: 409 });

  const key = commentImageKey(profile.profile.id, id, found.data.mime_type);
  if (!key) return Response.json({ error: "Could not remove that image." }, { status: 500 });
  const { failed } = await deleteMediaEntries([{ key, ownerId: profile.profile.id }]);
  if (failed.length > 0) return Response.json({ error: "Could not remove that image. Try again." }, { status: 502 });

  await admin
    .from("comment_media")
    .delete()
    .eq("id", id)
    .eq("owner_id", profile.profile.id)
    .neq("status", "attached");
  return Response.json({ ok: true });
}
