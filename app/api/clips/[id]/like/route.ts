import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { desiredStateSchema } from "@/lib/validations/social";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid like." }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const allowed = await supabase?.rpc("consume_rate_limit", { action: "like", max_hits: 60, window_seconds: 60 });
  if (allowed && allowed.data !== true) return Response.json({ error: "Too many likes. Slow down." }, { status: 429 });

  const result = await callSocial<{ liked: boolean; likes_count: number }>("set_like", {
    target: id,
    should_like: parsed.data.desired,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ liked: result.data.liked, likesCount: result.data.likes_count });
}
