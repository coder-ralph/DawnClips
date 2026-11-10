import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });

  const { isAuthenticated, userId } = await auth();
  if (isAuthenticated && userId) {
    const supabase = createServerSupabaseClient();
    const allowed = await supabase?.rpc("consume_rate_limit", {
      action: "clip_view",
      max_hits: 60,
      window_seconds: 600,
    });
    if (allowed && allowed.data !== true) return Response.json({ counted: false });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ counted: false });
  const { error } = await admin.rpc("record_clip_view", { target: id, clerk_user_id: userId });
  if (error) return Response.json({ counted: false });
  return Response.json({ counted: true });
}
