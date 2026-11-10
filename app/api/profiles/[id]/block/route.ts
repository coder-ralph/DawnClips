import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { desiredStateSchema } from "@/lib/validations/social";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid block." }, { status: 400 });
  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Profile not available." }, { status: 409 });
  if (profile.profile.id === id) return Response.json({ error: "You cannot block yourself." }, { status: 409 });

  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  if (parsed.data.desired) {
    const inserted = await supabase.from("blocks").insert({ blocker_id: profile.profile.id, blocked_id: id });
    if (inserted.error && inserted.error.code !== "23505") return Response.json({ error: "Could not block this player." }, { status: 500 });
    return Response.json({ blocked: true });
  }
  await supabase.from("blocks").delete().eq("blocker_id", profile.profile.id).eq("blocked_id", id);
  return Response.json({ blocked: false });
}
