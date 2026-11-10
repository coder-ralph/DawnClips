import { auth } from "@clerk/nextjs/server";
import { isModerator } from "@/lib/deletion-plan";
import { ensureCurrentProfile } from "@/lib/profile";
import { deleteObject, r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { callSocial } from "@/lib/social";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clipEditSchema } from "@/lib/validations/clip";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  // Text edit: allowed for 15 minutes after publishing. The database enforces the window.
  if (body && ("title" in body || "heroTags" in body)) {
    const parsed = clipEditSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid edit." }, { status: 400 });
    const result = await callSocial<Record<string, unknown>>("edit_clip", {
      target: id,
      new_title: parsed.data.title,
      new_description: parsed.data.description,
      new_tags: parsed.data.heroTags,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result.data);
  }

  const commentsMode = body?.commentsMode;
  if (typeof commentsMode !== "string" || !["everyone", "followers", "disabled"].includes(commentsMode)) {
    return Response.json({ error: "Invalid comment setting." }, { status: 400 });
  }
  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not available." }, { status: 409 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const updated = await supabase.from("clips").update({ comments_mode: commentsMode }).eq("id", id).eq("user_id", profile.profile.id).select("id");
  if (updated.error || !updated.data?.length) return Response.json({ error: "Clip not found." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  const profile = await ensureCurrentProfile();
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });
  const clip = await admin.from("clips").select("id, user_id, r2_object_key, thumbnail_object_key").eq("id", id).maybeSingle();
  // A failed lookup (for example a missing table grant) is a server problem, not a missing clip.
  if (clip.error) {
    console.error(`Clip delete lookup failed [${clip.error.code ?? "no-code"}] ${clip.error.message ?? ""}`);
    return Response.json({ error: "Could not delete the clip. Please try again." }, { status: 500 });
  }
  if (!clip.data) return Response.json({ error: "Clip not found." }, { status: 404 });
  const owns = profile.status === "ready" && profile.profile.id === clip.data.user_id;
  if (!owns && !isModerator(userId)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const keys = [clip.data.r2_object_key, clip.data.thumbnail_object_key].filter((key): key is string => Boolean(key));
  if (keys.length > 0 && !r2Configured()) return Response.json({ error: "Video storage is not configured." }, { status: 503 });
  for (const key of keys) {
    const removed = await deleteObject(key);
    if (!removed.ok) return Response.json({ error: "The video could not be deleted. The clip was kept." }, { status: 502 });
  }
  // Delete the row. Likes, comments, bookmarks, views, moments and watch events go with it (on delete cascade).
  const deleted = await admin.from("clips").delete().eq("id", id).select("id");
  if (deleted.error) {
    console.error(`Clip delete failed [${deleted.error.code ?? "no-code"}] ${deleted.error.message ?? ""}`);
    return Response.json({ error: "Could not delete the clip. Please try again." }, { status: 500 });
  }
  if (!deleted.data?.length) {
    console.error(`Clip delete removed no rows for ${id}`);
    return Response.json({ error: "Could not delete the clip. Please try again." }, { status: 500 });
  }

  // Best effort: notifications that point at the clip, and open reports about it, are no longer actionable.
  const [notifications, reports] = await Promise.all([
    admin.from("notifications").delete().eq("reference_id", id),
    admin.from("reports").update({ status: "resolved" }).eq("target_type", "clip").eq("target_id", id).in("status", ["open", "reviewing"]),
  ]);
  if (notifications.error) console.error(`Clip delete: notification cleanup failed [${notifications.error.code ?? "no-code"}]`);
  if (reports.error) console.error(`Clip delete: report cleanup failed [${reports.error.code ?? "no-code"}]`);
  return Response.json({ ok: true });
}
