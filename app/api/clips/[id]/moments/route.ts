import { auth } from "@clerk/nextjs/server";
import { listMoments } from "@/lib/clips";
import { callSocial } from "@/lib/social";
import { momentsSchema } from "@/lib/validations/clip";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ moments: [] });
  return Response.json({ moments: await listMoments(id) });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  const parsed = momentsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid moments." }, { status: 400 });
  const result = await callSocial<unknown[]>("set_clip_moments", { target: id, moments: parsed.data.moments });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ moments: result.data });
}
