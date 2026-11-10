import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";

export async function GET() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await callSocial<unknown[]>("list_notifications", { page_limit: 30 });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ notifications: result.data ?? [] });
}

export async function POST(request: Request) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (body.id && !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return Response.json({ error: "Invalid notification." }, { status: 400 });
  }
  const result = body.id
    ? await callSocial("mark_notification_read", { target: body.id })
    : await callSocial("mark_all_notifications_read", {});
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
