import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { plainText } from "@/lib/text";
import { reportSchema } from "@/lib/validations/clip";

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid report." }, { status: 400 });

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return Response.json({ error: "Create a profile before reporting." }, { status: 409 });

  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const allowed = await supabase.rpc("consume_rate_limit", {
    action: "report",
    max_hits: 10,
    window_seconds: 3600,
  });
  if (allowed.error || allowed.data !== true) {
    return Response.json({ error: "Too many reports. Try again later." }, { status: 429 });
  }

  const inserted = await supabase.from("reports").insert({
    reporter_id: profile.profile.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
    description: plainText(parsed.data.description),
  });
  if (inserted.error) return Response.json({ error: "Could not submit the report." }, { status: 500 });
  return Response.json({ ok: true });
}
