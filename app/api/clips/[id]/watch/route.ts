import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { watchSchema } from "@/lib/validations/clip";

/** Records how long a play session lasted so creators can see watch time in Insights. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ recorded: false }, { status: 404 });
  const parsed = watchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ recorded: false }, { status: 400 });

  const { isAuthenticated, userId } = await auth();
  if (isAuthenticated && userId) {
    const supabase = createServerSupabaseClient();
    const allowed = await supabase?.rpc("consume_rate_limit", { action: "clip_watch", max_hits: 120, window_seconds: 600 });
    if (allowed && allowed.data !== true) return Response.json({ recorded: false });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ recorded: false });
  const { error } = await admin.rpc("record_clip_watch", { target: id, clerk_user_id: userId ?? null, seconds: parsed.data.seconds });
  return Response.json({ recorded: !error });
}
