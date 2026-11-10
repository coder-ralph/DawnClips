import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";
import { desiredStateSchema } from "@/lib/validations/social";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid bookmark." }, { status: 400 });

  const result = await callSocial<{ saved: boolean }>("set_bookmark", {
    target: id,
    should_save: parsed.data.desired,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}
