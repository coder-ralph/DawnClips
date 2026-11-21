import { auth } from "@clerk/nextjs/server";
import { discardPhotoPost } from "@/lib/media-cleanup";
import { ensureCurrentProfile } from "@/lib/profile";
import { r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { postUploadCancelSchema } from "@/lib/validations/post";

/** Abandons an unfinished photo post: its uploaded images are deleted from R2 (derived keys, owner-bound) and it is marked removed. */
export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = postUploadCancelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid upload." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not found." }, { status: 409 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });

  const post = await supabase
    .from("clips")
    .select("id, status")
    .eq("id", parsed.data.postId)
    .eq("user_id", profile.profile.id)
    .eq("kind", "photo")
    .maybeSingle();
  if (!post.data) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (!["pending", "processing"].includes(post.data.status)) return Response.json({ ok: true });
  if (!r2Configured()) return Response.json({ error: "Photo storage is not configured." }, { status: 503 });

  const discarded = await discardPhotoPost(admin, profile.profile.id, post.data.id as string, "removed");
  if (!discarded) return Response.json({ error: "Could not delete the uploaded photos. Try again." }, { status: 502 });
  return Response.json({ ok: true });
}
