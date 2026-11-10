import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";
import { desiredStateSchema } from "@/lib/validations/social";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid follow." }, { status: 400 });
  const result = await callSocial<{ following: boolean; followers_count: number }>("set_follow", {
    target: id,
    should_follow: parsed.data.desired,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ following: result.data.following, followersCount: result.data.followers_count });
}
