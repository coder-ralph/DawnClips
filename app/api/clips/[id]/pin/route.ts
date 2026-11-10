import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";
import { desiredStateSchema } from "@/lib/validations/social";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const result = await callSocial<{ pinned: boolean }>("set_clip_pinned", { target: id, should_pin: parsed.data.desired });
  if (!result.ok) {
    const message = result.status === 403 ? "Only your own public clips can be pinned." : result.error;
    return Response.json({ error: message }, { status: result.status });
  }
  return Response.json(result.data);
}
