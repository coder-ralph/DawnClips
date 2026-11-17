import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { commentBodySchema } from "@/lib/validations/social";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await callSocial<unknown[]>("list_comments", { target: id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ comments: result.data ?? [] });
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

  const result = await callSocial("add_comment", {
    target: id,
    parent: parsed.data.parentId ?? null,
    body: parsed.data.content,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}
