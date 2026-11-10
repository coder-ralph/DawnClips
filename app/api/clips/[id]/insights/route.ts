import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Clip not found." }, { status: 404 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const result = await callSocial<Record<string, unknown>>("clip_insights", { target: id, days: [7, 30, 90].includes(days) ? days : 30 });
  if (!result.ok) {
    const message = result.status === 403 ? "Insights are only available to the creator." : result.error;
    return Response.json({ error: message }, { status: result.status });
  }
  return Response.json(result.data);
}
